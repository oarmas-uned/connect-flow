/**
 * Flow Automata — content-script entry point (Flow Angular UI, 2026-09).
 *
 * Speaks exactly the message protocol the existing side panel and service
 * worker already use, so neither of them needed changing:
 *
 *   in   PREPARE_IMAGE / PREPARE_IMAGE_CHUNK  {id, data|chunk,...}
 *        AUTO_FILL_FLOW                       {payloads, groupId,
 *                                              concurrentPrompts,
 *                                              promptDelaySecondsMin/Max}
 *        CANCEL_PROMPT_GROUP                  {groupId}
 *        CHECK_FLOW_PAGE                      -> {isFlowPage}
 *
 *   out  ACTION_LOG                {level, message, timestamp}
 *        VIDEO_GENERATION_PROGRESS {promptIndex, percentage, status, prompt}
 *        PROMPT_GROUP_STATUS       {id, status, processedCount, ...}
 *        SET_ZOOM / SET_FOLDER_NAME / DOWNLOAD_VIDEO / CIT / CC
 */
(function () {
  'use strict';

  const FA = globalThis.FA;
  const D = FA.driver;
  const { log, sleep } = D;

  const FLOW_HOSTS = ['flow.google.com', 'labs.google'];
  const onFlow = () => FLOW_HOSTS.some((h) => location.href.includes(h));

  // Zooming out keeps more of the virtual scroller's tiles alive at once, so
  // it is worth doing while a batch runs. It is NOT worth doing at page load:
  // chrome.tabs.setZoom is per-ORIGIN and outlives both the tab and the
  // extension, so the old build's load-time zoom-out left Flow permanently at
  // 80% for anyone whose batch ever failed. Scoped to a run, always restored.
  const setZoom = (zoomFactor) => {
    if (onFlow()) D.send({ type: 'SET_ZOOM', zoomFactor });
  };

  // ---- a batch in a background tab ---------------------------------------
  // MEASURED on flow.google.com 2026-09-15, in a tab hidden behind another
  // window: a chain of setTimeout(100) calls took 1s each, then 60s each once
  // the chain was a few calls deep — Chrome's intensive wake-up throttling.
  // Every wait in this engine is such a chain, and so is some of Flow's own
  // overlay clean-up, so a batch left running in the background moved about
  // one step a minute. Chrome does not apply that throttling to a page with an
  // open WebRTC connection: opening a data channel between two connections in
  // the same page took the same chain back to 1s, and closing it brought the
  // 60s wake-ups straight back. So a batch holds one open while it runs. It
  // connects the page to itself: no ICE servers, no camera or microphone, and
  // nothing leaves the machine.
  //
  // Chrome can also discard a background tab outright, which would end a batch
  // mid-prompt; the service worker (background.js) marks the tab
  // non-discardable for the same span. Both are scoped to a run and always
  // undone, like the zoom.
  const keepAwake = (() => {
    let peers = null;
    const release = () => {
      const open = peers;
      peers = null;
      for (const pc of open || []) {
        try {
          pc.close();
        } catch (_) {}
      }
    };
    const start = async () => {
      D.send({ type: 'FA_KEEP_TAB_LOADED', keep: true });
      if (peers || typeof RTCPeerConnection !== 'function') return;
      const mine = [];
      peers = mine;
      try {
        const a = new RTCPeerConnection();
        mine.push(a);
        const b = new RTCPeerConnection();
        mine.push(b);
        a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
        b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
        a.createDataChannel('flow-automata-keep-awake');
        await a.setLocalDescription(await a.createOffer());
        await b.setRemoteDescription(a.localDescription);
        await b.setLocalDescription(await b.createAnswer());
        await a.setRemoteDescription(b.localDescription);
      } catch (e) {
        if (peers !== mine) return; // the batch ended while it was connecting
        release();
        log.warn(
          `Could not keep Flow running in the background (${e && e.message}). Keep the Flow window in view while this batch runs, or it will slow right down.`
        );
      }
    };
    const stop = () => {
      release();
      D.send({ type: 'FA_KEEP_TAB_LOADED', keep: false });
    };
    return { start, stop };
  })();

  // ---- image staging ---------------------------------------------------
  // The panel splits large base64 payloads into chunks to stay under the
  // message size limit, then references them by id from each payload.
  const images = {};
  const chunks = {};

  const receiveImage = (msg, respond) => {
    const { id, data } = msg;
    if (!id || !data) return respond({ success: false, error: 'Bad image payload' });
    images[id] = data;
    respond({ success: true });
  };

  const receiveImageChunk = (msg, respond) => {
    const { id, chunk, chunkIndex, totalChunks } = msg;
    if (!id) return respond({ success: false, error: 'Bad chunk' });
    const buf = (chunks[id] = chunks[id] || []);
    buf[chunkIndex] = chunk;
    const complete = buf.filter((c) => typeof c === 'string').length === totalChunks;
    if (complete) {
      try {
        images[id] = JSON.parse(buf.join(''));
        delete chunks[id];
      } catch (e) {
        return respond({ success: false, error: `Could not reassemble image: ${e.message}` });
      }
    }
    respond({ success: true, complete });
  };

  // ---- group queue -----------------------------------------------------
  const queue = [];
  let active = null;

  const broadcast = (group) =>
    D.send({
      type: 'PROMPT_GROUP_STATUS',
      data: {
        id: group.id,
        status: group.status,
        processedCount: group.processedCount,
        totalCount: group.totalCount,
        createdAt: group.createdAt,
        isCancelling: !!group.isCancelling,
        isActive: active === group.id,
        delayRemainingSeconds: group.delayRemainingSeconds,
        results: group.results.map((r) => ({
          index: r.index,
          promptIndex: r.promptIndex,
          success: r.success,
          downloadComplete: r.downloadComplete,
          error: r.error,
        })),
        currentPromptIndex: group.currentPromptIndex,
        promptPreviews: group.payloads.map((p) => String((p && p.prompt) || '').substring(0, 60)),
        retryCountByIndex: { ...group.retryCountByIndex },
        downloadRetryCountByIndex: { ...group.downloadRetryCountByIndex },
      },
    });

  const enqueue = (msg, respond) => {
    const { payloads, groupId, concurrentPrompts, promptDelaySecondsMin, promptDelaySecondsMax } = msg;

    // Resolve staged images back onto their payloads. An id with nothing
    // staged under it (the tab reloaded between PREPARE_IMAGE and this
    // message, or a chunk never arrived) used to vanish in the filter, and
    // the prompt then ran as plain text-to-image. It is counted instead, so
    // the step machine can refuse that prompt by name.
    const resolved = (payloads || []).map((p) => {
      if (!p || !Array.isArray(p.imageIds)) return p;
      const found = p.imageIds.map((id) => images[id]).filter(Boolean);
      return { ...p, images: found, missingImages: p.imageIds.length - found.length };
    });

    if (concurrentPrompts > 1) {
      // One chat session, one conversation. Parallel prompts would interleave
      // in the same thread and make the media-id diff ambiguous.
      log.warn(
        `Concurrency ${concurrentPrompts} requested — Flow's prompt box takes one prompt at a time, so prompts are sent sequentially.`
      );
    }

    // Video modes used to be announced here as never run end to end. All
    // three — text, frames and ingredients to video — were run from the side
    // panel on 2026-09-27 and delivered renamed MP4s, so the warning is gone.
    const videoPrompts = resolved.filter((p) => p && /video/i.test(String(p.mode || '')));

    // "concat" chained prompts on the old interface: a video continued from
    // the previous clip's last frame, an image edited the previous image. The
    // new interface does that through its scene builder, which is not mapped,
    // so each prompt runs on its own. Said up front, because the result is a
    // set of separate clips rather than one continuous one.
    const chained = resolved.filter((p) => p && (p.isConcat || /concat/i.test(String(p.videoOption || ''))));
    if (chained.length) {
      log.warn(
        `${chained.length} prompt(s) are set to "concat". Chaining prompts is not supported on Flow's new interface yet, so every prompt runs as its own ${videoPrompts.length ? 'clip' : 'image'} and nothing is joined.`
      );
    }

    const group = {
      id: groupId || `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payloads: resolved,
      promptDelaySecondsMin: promptDelaySecondsMin || 0,
      promptDelaySecondsMax: promptDelaySecondsMax || 0,
      respond,
      status: 'queued',
      createdAt: Date.now(),
      processedCount: 0,
      totalCount: resolved.length,
      isCancelling: false,
      results: [],
      pendingIndexes: resolved.map((_, i) => i),
      currentPromptIndex: undefined,
      delayRemainingSeconds: undefined,
      retryCountByIndex: {},
      downloadRetryCountByIndex: {},
    };
    queue.push(group);
    broadcast(group);
    respond({ success: true });
  };

  const cancel = (groupId) => {
    const i = queue.findIndex((g) => g.id === groupId);
    if (i < 0) return { success: false, error: 'Prompt group not found' };
    const group = queue[i];
    if (group.status === 'queued') {
      group.status = 'cancelled';
      queue.splice(i, 1);
      broadcast(group);
      return { success: true, cancelled: true };
    }
    if (group.status === 'running') {
      group.isCancelling = true;
      broadcast(group);
      return { success: true, cancelling: true };
    }
    return { success: false, error: 'Prompt group is already finished' };
  };

  /** Random inter-prompt delay, counted down so the panel can display it. */
  const waitBetweenPrompts = async (group) => {
    const min = Number(group.promptDelaySecondsMin) || 0;
    const max = Math.max(min, Number(group.promptDelaySecondsMax) || 0);
    if (max <= 0) return;
    const total = Math.round(min + Math.random() * (max - min));
    for (let left = total; left > 0; left--) {
      if (group.isCancelling) return;
      group.delayRemainingSeconds = left;
      broadcast(group);
      await sleep(1000);
    }
    group.delayRemainingSeconds = undefined;
    broadcast(group);
  };

  /**
   * Results are keyed by index rather than appended. A prompt now reports
   * twice — once when Flow produces output, once when its download finishes
   * — and the second report has to replace the first, or the panel gets two
   * rows for one prompt and its counts go wrong.
   */
  const upsertResult = (group, row) => {
    const at = group.results.findIndex((r) => r.index === row.index);
    if (at >= 0) group.results[at] = { ...group.results[at], ...row };
    else group.results.push(row);
  };

  const runGroup = async (group) => {
    group.status = 'running';
    active = group.id;
    setZoom(0.8);
    keepAwake.start();
    broadcast(group);

    const cancelled = () => group.isCancelling;
    let settingsApplied = false;

    // Circuit breaker. MEASURED 2026-09-10: a batch of two prompts produced
    // nine consecutive "Sorry, this image failed to generate." tiles over
    // nine minutes, because that wording is not a quota refusal and is
    // therefore retryable — correctly, in isolation. What no single prompt
    // could see is that the SAME refusal was coming back for a different
    // prompt too, which means the cause is the account or the service and
    // not the text being sent. Flow answered the eighth attempt with
    // "We noticed some unusual activity", so continuing is not merely
    // futile, it is what gets an account flagged.
    let lastFailure = null;
    let sameFailureRun = 0;
    const REPEAT_LIMIT = 3;

    for (let i = 0; i < group.payloads.length; i++) {
      if (group.isCancelling) break;

      const payload = group.payloads[i];
      group.currentPromptIndex = payload.promptIndex;
      broadcast(group);

      // Settings are applied once per batch: the agent settings panel
      // persists, so re-saving per prompt would be pointless writes. The
      // panel's Aspect Ratio and Outputs-per-Prompt controls have no other
      // route into the new UI, so a payload carrying them is taken as the
      // instruction to write them; `applyAgentSettings: false` opts out.
      // Nothing here touches "Confirm before generating" — that setting
      // spends credits without asking and stays the user's own decision.
      //
      // Keyed to the first prompt that gets far enough to write them, NOT to
      // i === 0: on 2026-09-08 prompt 1 died at the agent-panel check, which
      // silently cost the whole batch its aspect ratio and output count.
      const wantsSettings =
        payload.applyAgentSettings !== false && !!(payload.aspectRatio || payload.outputCount);

      // Flow's agent fails transiently — "The agent failed. Please try again."
      // — and the identical prompt succeeds moments later. The side panel has
      // always sent maxRetries and rendered a per-prompt retry count; the new
      // engine was ignoring both and throwing away work the user paid for.
      const maxRetries = Math.max(0, Number(payload.maxRetries) || 0);
      let result;
      for (let attempt = 0; ; attempt++) {
        result = await FA.stepMachine.runPrompt(payload, {
          cancelled,
          applySettings: wantsSettings && !settingsApplied,
          // Flow itself reports nothing while it generates — no progress bar,
          // no spinner, no stop button (measured across a full generation on
          // 2026-09-09), so there is no percentage to mirror and none can be
          // invented honestly. What there IS is the moment output appears,
          // roughly two thirds of the way through a prompt, and the panel can
          // draw that: a success with downloadComplete false renders as
          // "Submitted". Reporting it moves the chip once mid-prompt instead
          // of leaving it on "Running" for the whole minute.
          onPhase: (phase) => {
            if (phase !== 'generated' || group.isCancelling) return;
            upsertResult(group, {
              index: i,
              promptIndex: payload.promptIndex,
              success: true,
              downloadComplete: false,
            });
            broadcast(group);
          },
        });
        if (result.settingsApplied) settingsApplied = true;
        if (result.success || result.cancelled || group.isCancelling || attempt >= maxRetries) break;
        // Some failures cannot be fixed by sending the same text again — a
        // clarifying question is the agent's considered answer, not a glitch.
        if (result.retryable === false) {
          log.warn(`Prompt ${payload.promptIndex} will not be retried: resending identical text would get the same answer`);
          break;
        }
        // Drop any interim "generated" row first. The panel decides a chip's
        // state from the result row if one exists and only falls through to
        // the retry badge when there is none, so a leftover row from an
        // attempt whose download failed would show "Submitted" for the whole
        // of the next attempt and hide the retry count entirely.
        group.results = group.results.filter((r) => r.index !== i);
        group.retryCountByIndex[i] = attempt + 1;
        // The side panel's "Retrying xN" badge reads downloadRetryCountByIndex
        // and nothing else — measured in the panel bundle, which never looks
        // at retryCountByIndex at all. Nothing has ever written the field it
        // does read, so the badge could not appear no matter how many times a
        // prompt was retried, and a batch quietly re-running the same prompt
        // six times looked identical to one sitting still. The panel is
        // frozen, so the engine fills the field the panel actually reads.
        group.downloadRetryCountByIndex[i] = attempt + 1;
        // Backoff rather than a flat 3s. MEASURED 2026-09-10: six retries
        // three seconds apart, each following a ~45s refusal, is a burst,
        // and the run that produced it ended with Flow's "unusual activity"
        // notice. Doubling the gap costs a batch that is failing anyway a
        // little time, and stops the traffic looking quite so much like a
        // script hammering the endpoint.
        const backoff = Math.min(30000, 3000 * 2 ** attempt);
        log.warn(
          `Prompt ${payload.promptIndex} failed (${result.error}) — retrying in ${Math.round(
            backoff / 1000
          )}s, attempt ${attempt + 2} of ${maxRetries + 1}`
        );
        broadcast(group);
        await sleep(backoff);
      }

      upsertResult(group, {
        index: i,
        promptIndex: payload.promptIndex,
        success: !!result.success,
        downloadComplete: !!(result.downloads && result.downloads.length),
        error: result.error,
      });
      group.processedCount++;
      group.pendingIndexes = group.pendingIndexes.filter((n) => n !== i);
      broadcast(group);

      if (result.cancelled) break;

      // Flow said "We noticed some unusual activity." Checked before quota
      // because it is the more serious of the two and must never be treated
      // as something to wait out and resume: the batch stops, and the
      // message says what it actually means rather than paraphrasing it.
      if (result.blocked) {
        const left = group.payloads.length - (i + 1);
        log.error(
          `Stopping the batch: Flow has flagged this session as unusual activity${
            left > 0 ? `, so the remaining ${left} prompt(s) were not sent` : ''
          }. Give the account a rest before automating it again — retrying is the behaviour being flagged.`
        );
        break;
      }

      // Something only the user can resolve, such as Flow's one-time "Rights
      // to use this image" question going unanswered or being declined.
      // Every later image prompt would ask the same question again.
      if (result.halt) {
        const left = group.payloads.length - (i + 1);
        log.error(
          `Stopping the batch: ${result.error}${left > 0 ? ` The remaining ${left} prompt(s) were not sent.` : ''}`
        );
        break;
      }

      // Flow said "You've reached your usage limit. Please try again later."
      // Every remaining prompt would walk into the same wall a minute apart,
      // so the batch stops here and says why — the same reasoning as the old
      // bundle's global-throttle abort (0.3.43), against the new surface.
      if (result.quota) {
        const left = group.payloads.length - (i + 1);
        log.error(
          left > 0
            ? `Stopping the batch: Flow is out of quota, so the remaining ${left} prompt(s) would fail the same way. Try again once your limit resets.`
            : 'Flow is out of quota. Try again once your limit resets.'
        );
        break;
      }

      // Circuit breaker (declared above). One prompt failing is a prompt
      // problem; the same message coming back for prompt after prompt is an
      // account or service problem, and sending the rest of the queue into
      // it wastes the user's time and Flow's patience in equal measure. A
      // success anywhere clears the run, so an intermittent failure never
      // trips it.
      if (result.success) {
        lastFailure = null;
        sameFailureRun = 0;
      } else {
        const signature = String(result.error || '').replace(/\s+/g, ' ').trim();
        sameFailureRun = signature && signature === lastFailure ? sameFailureRun + 1 : 1;
        lastFailure = signature;
        if (sameFailureRun >= REPEAT_LIMIT) {
          const left = group.payloads.length - (i + 1);
          log.error(
            `Stopping the batch: ${sameFailureRun} prompts in a row failed with the same message, so the prompts are not what is wrong${
              left > 0 ? ` — the remaining ${left} were not sent` : ''
            }. Flow said: ${signature}`
          );
          break;
        }
      }

      if (i < group.payloads.length - 1) await waitBetweenPrompts(group);
    }

    const cancelledRun = group.isCancelling;
    group.status = cancelledRun ? 'cancelled' : group.results.every((r) => r.success) ? 'completed' : 'error';
    group.currentPromptIndex = undefined;
    active = null;
    broadcast(group);

    try {
      group.respond({
        success: !cancelledRun && group.results.every((r) => r.success),
        cancelled: cancelledRun,
        results: group.results,
      });
    } catch (_) {
      /* panel may have closed mid-run */
    }

    const at = queue.indexOf(group);
    if (at >= 0) queue.splice(at, 1);
  };

  // Single consumer — one Flow session, one batch at a time.
  (async () => {
    for (;;) {
      if (!queue.length || active) {
        await sleep(500);
        continue;
      }
      const next = queue[0];
      if (next.status === 'cancelled') {
        queue.shift();
        continue;
      }
      try {
        await runGroup(next);
      } catch (e) {
        log.error(`Batch failed: ${e && e.message}`);
        next.status = 'error';
        broadcast(next);
        active = null;
        const at = queue.indexOf(next);
        if (at >= 0) queue.splice(at, 1);
      } finally {
        setZoom(1);
        keepAwake.stop();
      }
    }
  })();

  // ---- message router --------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    switch (msg && msg.type) {
      case 'PREPARE_IMAGE':
        receiveImage(msg, respond);
        return true;
      case 'PREPARE_IMAGE_CHUNK':
        receiveImageChunk(msg, respond);
        return true;
      case 'AUTO_FILL_FLOW':
        enqueue(msg, respond);
        return true; // held open until the batch finishes
      case 'CANCEL_PROMPT_GROUP':
        respond(cancel(msg.groupId));
        return true;
      case 'CHECK_FLOW_PAGE':
        respond({ isFlowPage: onFlow() && location.href.includes('flow') });
        return true;
      default:
        return true;
    }
  });

  log.info('Flow Automata ready (Angular UI build)');
})();
