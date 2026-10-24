/**
 * Flow Automata — per-prompt step machine for Flow's Angular UI (2026-09).
 *
 * The old machine was: create project -> open config popover -> pick mode tab
 * -> pick aspect ratio -> pick model -> pick count -> type -> submit -> poll
 * tiles by data-tile-id -> cascade download. Half of those controls no longer
 * exist: mode/ratio/model/count moved into a single persisted "Agent
 * settings" panel, and generation is mediated by a chat agent.
 *
 * The new machine is correspondingly shorter:
 *
 *     Open project -> (once per batch) apply settings -> fill prompt ->
 *     submit -> wait for the busy/idle swap -> diff media ids -> download
 *
 * Two behaviours measured on 2026-09-07 drive the design:
 *
 *   - The agent decides how many outputs a prompt deserves. Settings said x2
 *     and it produced one image. So the machine COUNTS WHAT ARRIVES via
 *     data-media-id instead of waiting for an expected N, which would hang.
 *   - The agent rewrites captions ("a red cube on a plain white background"
 *     came back as "Red cube on white background"), so a tile can never be
 *     matched back to its prompt by text. Identity is the media id diff.
 */
(function () {
  'use strict';

  const FA = (globalThis.FA = globalThis.FA || {});
  const S = FA.selectors;
  const D = FA.driver;
  const { sleep, log, $, $$ } = D;

  /** Filename-safe slug, matching the old bundle's naming so downloads sort the same. */
  const slug = (text) => {
    if (!text) return 'image';
    let t = String(text).replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
    t = t.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    return (t.length > 50 ? t.slice(0, 50) : t) || 'image';
  };

  const reportProgress = (payload, percentage, status) =>
    D.send({
      type: 'VIDEO_GENERATION_PROGRESS',
      data: {
        promptIndex: payload.promptIndex,
        percentage,
        status,
        prompt: payload.prompt,
      },
    });

  const checkCancelled = (cancelled) => {
    if (cancelled && cancelled()) throw new FA.CancelledError();
  };

  /**
   * New output always lands at grid index 0, but the cdk virtual scroller
   * keeps only the visible window in the DOM. That cuts both ways: a fresh
   * tile is invisible to the diff if the grid is scrolled down, and an old
   * tile scrolling back into view looks fresh. Normalising to the top before
   * each snapshot keeps the two ends of the diff comparable.
   */
  const scrollGridToTop = () => {
    const vp = $(S.virtualScroller);
    if (!vp) return false;
    try {
      vp.scrollTop = 0;
      return true;
    } catch (_) {
      return false;
    }
  };

  /**
   * A media-id snapshot taken while the grid is still painting is worse than
   * no snapshot at all: every tile that renders *after* it looks like new
   * output. That is how the 2026-09-08 batch reported "1 output(s) ready" and
   * downloaded an old image for a prompt Flow never generated — the page was
   * still hydrating (prompt 1 had just failed the agent-panel check) and a
   * fixed 300ms pause was not nearly enough.
   *
   * So wait for the set to stop changing instead of guessing a duration.
   */
  const settledMediaIds = async ({ cancelled, timeout = 6000 } = {}) => {
    scrollGridToTop();
    const deadline = Date.now() + timeout;
    let prev = D.mediaIds();
    let stable = 0;
    for (;;) {
      checkCancelled(cancelled);
      await sleep(400);
      const now = D.mediaIds();
      const same = now.size === prev.size && [...now].every((id) => prev.has(id));
      stable = same ? stable + 1 : 0;
      prev = now;
      if (stable >= 2 || Date.now() > deadline) {
        if (stable < 2) log.warn('Media grid never settled — output detection may be unreliable for this prompt');
        return prev;
      }
    }
  };

  // =====================================================================
  // Step 1 — make sure we are inside a project
  // =====================================================================
  const ensureProject = async (cancelled) => {
    if (D.inProject()) {
      log.info('Already inside a project, skipping creation');
      return true;
    }
    log.info('Not in a project — creating one');
    const btn = await D.waitFor(() => $(S.createProjectButton), {
      label: 'New project button',
      cancelled,
    });
    D.click(btn, 'New project button');
    await D.waitFor(() => D.inProject(), {
      timeout: 30000,
      label: 'project page to open',
      cancelled,
    });
    // The project shell renders after the URL changes.
    await D.waitFor(() => $(S.promptEditor), { timeout: 30000, label: 'composer', cancelled });
    log.info('Project created');
    return true;
  };

  // =====================================================================
  // Step 2 — agent panel must be open, or there is nothing to type into
  // =====================================================================
  const ensureAgentPanel = async (cancelled) => {
    // Wait, do not test once. Angular renders asynchronously, so an immediate
    // check reports "the user closed it" for what is really "not painted yet"
    // — how prompt 1 of the first live batch (2026-09-08 11:50:47) failed
    // while prompt 2 found the same panel present 29 seconds later.
    //
    // What is required is a COMPOSER, not a chat panel. There is only one
    // composer on a project page (flow-base-prompt-box nests inside
    // flow-creative-agent-prompt-box, which nests inside flow-agent-panel),
    // and closing the chat removes flow-agent-panel while leaving the box
    // behind. Requiring flow-agent-panel meant the engine created a project,
    // found a perfectly usable composer, and refused to type into it —
    // observed 2026-09-08 20:52, with the batch dying silently after
    // "Open Project".
    const usable = () =>
      ($(S.agentPanel) || $(S.promptBoxDirect)) && $(S.promptEditor) ? true : null;
    try {
      await D.waitFor(usable, { timeout: 8000, label: 'a usable prompt box', cancelled });
      return true;
    } catch (e) {
      if (e && e.cancelled) throw e;
    }
    log.warn('No usable prompt box — neither the agent panel nor the direct box is present');
    throw new Error(
      'Flow has no prompt box on this page. Open a project, then run again.'
    );
  };

  // =====================================================================
  // Step 2b — take the prompt box out of Agent mode
  // =====================================================================
  /**
   * The control the engine was missing.
   *
   * Flow's composer carries a chip reading "Agent", pressed by default. With
   * it pressed the prompt is a message to a chat agent: it interviews
   * narrative prompts rather than drawing them, it asks for confirmation
   * before spending anything when "Confirm before generating" is Always (as
   * it is on this account), and its Settings trigger offers nothing but
   * aspect ratio. Un-press it and the same composer generates straight into
   * the media grid — no chat turn, no interview — and the Settings trigger
   * gains Image/Video, the full ratio set, the model family and x1-x4.
   *
   * Every batch runs in direct mode. A user who wants the agent's opinion
   * can ask it themselves; automation needs the deterministic surface.
   */
  const ensureDirectMode = async (cancelled) => {
    checkCancelled(cancelled);
    const chip = $(S.agentModeChip);
    // Flow's current composer has no Agent chip at all (measured 2026-09-16
    // and every live run since) — it is the direct prompt box — so its
    // absence is the normal case and not worth a warning on every prompt.
    if (!chip) return false;
    if (!D.isPressed(chip)) {
      log.info('Prompt box is already in direct mode');
      return true;
    }
    D.click(chip, 'Agent mode chip (switching to direct generation)');
    const off = await D.waitFor(() => (!D.isPressed($(S.agentModeChip)) ? true : null), {
      timeout: 5000,
      label: 'the Agent chip to release',
      cancelled,
    }).catch(() => null);
    if (!off) {
      log.warn(
        'The Agent chip would not release — prompts will go to Flow\'s chat agent, which asks questions instead of generating'
      );
      return false;
    }
    log.info('Switched the prompt box out of Agent mode — prompts now generate directly');
    return true;
  };

  // =====================================================================
  // Step 3 — apply batch settings (opt-in; this panel PERSISTS)
  // =====================================================================
  /**
   * The old UI set ratio/model/count in a transient popover, per prompt.
   * The new panel has a Save button and keeps the values, so applying them
   * writes to the user's account. That is only done when the caller asks
   * (`applySettings`), and the outcome is logged either way.
   */
  const applyAgentSettings = async (payload, cancelled) => {
    // In direct mode this panel is the wrong one to write to: it holds the
    // CHAT AGENT's defaults, the Settings (tune) button that opens it is not
    // even rendered, and applyPromptBoxSettings has already set the controls
    // that actually govern the batch. Looking for it here and warning about
    // what is missing reads like a failure when nothing is wrong.
    const chip = $(S.agentModeChip);
    if (chip && !D.isPressed(chip)) return false;
    if ($(S.promptBoxDirect) && !$(S.agentPanel)) return false;
    const settingsBtn = D.byLabel(S.settingsLabel);
    if (!settingsBtn) {
      log.warn('Settings button not found — using whatever defaults Flow has');
      return false;
    }
    D.click(settingsBtn, 'Settings');
    // Scoped to the panel — a document-wide '*' scan walks thousands of nodes
    // on every poll tick.
    const panel = await D.waitFor(
      () => {
        const p = $(S.agentPanel);
        return p && D.textOf(p).includes(S.settingsImageSectionText) ? p : null;
      },
      { label: 'agent settings panel', cancelled, timeout: 8000 }
    ).catch(() => null);
    if (!panel) {
      log.warn('Agent settings did not open — continuing with existing defaults');
      return false;
    }

    // MEASURED 2026-09-09: these are mat-button-toggles whose text is
    // "crop_16_9\n16:9" — the icon ligature is its own text node and comes
    // FIRST. An exact match on the whole text or on the first line therefore
    // never matched a ratio, and every batch logged "Aspect ratio 16:9 not
    // offered by Flow" while the control sat right there. The label is the
    // last line, which is what byLastLine reads.
    // The panel carries the same controls twice — "Image generation default"
    // then "Video generation default" — so a plain first-match writes the
    // image section whatever the batch asked for. Pick the section by
    // document position relative to the video heading, and fall back to
    // first-match where that comparison is unavailable.
    const wantVideo = /video/i.test(String(payload.mode || ''));
    const heading = D.$$('*', panel).find(
      (el) => !el.children.length && D.textOf(el) === S.settingsVideoSectionText
    );
    const inWantedSection = (el) => {
      if (!heading || typeof heading.compareDocumentPosition !== 'function') return true;
      const follows = !!(heading.compareDocumentPosition(el) & 4 /* DOCUMENT_POSITION_FOLLOWING */);
      return wantVideo ? follows : !follows;
    };
    const pickInPanel = (wanted) =>
      D.$$(S.toggleOption, panel).find((el) => {
        const lines = D.textOf(el).split('\n').map((l) => l.trim()).filter(Boolean);
        return lines[lines.length - 1] === wanted && inWantedSection(el);
      }) || null;

    let applied = [];
    if (payload.aspectRatio) {
      const btn = pickInPanel(S.ratioButtonText(payload.aspectRatio));
      if (btn) { D.click(btn, 'aspect ratio'); applied.push(`ratio ${payload.aspectRatio}`); }
      else log.warn(`Aspect ratio ${payload.aspectRatio} not offered by Flow`);
    }
    if (payload.outputCount) {
      const btn = pickInPanel(S.countButtonText(payload.outputCount));
      if (btn) { D.click(btn, 'output count'); applied.push(`count x${payload.outputCount}`); }
      else log.warn(`Output count x${payload.outputCount} not offered by Flow`);
    }
    await sleep(150);

    const save = D.byText('button', S.textFallbacks.Save, { root: panel, exact: true });
    if (save) {
      D.click(save, 'Save settings');
      log.info(`Agent settings saved: ${applied.join(', ') || 'no changes'}`);
    } else {
      log.warn('Save button not found in agent settings');
    }
    await D.dismissOverlays();

    // This panel shares the agent panel with the chat view, and whether Save
    // dismisses it has not been observed. Make sure the composer is reachable
    // again before the caller starts typing into it, rather than letting the
    // next step time out against a covered editor.
    const composerBack = await D.waitFor(() => $(S.promptEditor), {
      timeout: 5000,
      label: 'composer after settings',
    }).catch(() => null);
    if (!composerBack) {
      const close = D.byLabel('Close') || D.byLabel('Back');
      if (close) {
        log.warn('Agent settings stayed open after Save — closing it');
        D.click(close, 'Close settings');
        await sleep(400);
      } else {
        log.warn('Agent settings may still be covering the composer');
      }
    }
    return true;
  };

  // =====================================================================
  // Step 3b — the direct prompt box's own settings
  // =====================================================================
  /**
   * The deterministic surface, re-measured on the live app 2026-09-09 and
   * mapped control by control from Flow's source on 2026-09-14.
   *
   * What the "Settings trigger" offers depends entirely on the Agent chip,
   * which is why ensureDirectMode has to run first:
   *
   *   Agent pressed  -> aspect ratio only. No mode, no count.
   *   Agent released -> flow-prompt-box-settings, one flow-toggles group per
   *                     control, each carrying its own aria-label:
   *                       Mode          Image | Video
   *                       Video type    Frames | Ingredients   (video only)
   *                       Aspect ratio  16:9 4:3 1:1 3:4 9:16  (video: 16:9, 9:16)
   *                       Select model family   a menu of server-named models
   *                       Video duration 4s 6s 8s  (only when the model has a choice)
   *                       Output count  x1 x2 x3 x4
   *
   * A box left on Video answers an image prompt with a video (or with
   * nothing, for 87s), so the mode is set explicitly every batch. The model
   * is picked before ratio and duration because it decides which of those
   * exist.
   */
  const isVideo = (payload) => /video/i.test(String((payload && payload.mode) || ''));

  /** The side panel's "8s" or "8s-concat" as Flow labels it: "8s". */
  const durationLabel = (videoOption) => {
    const m = /^\s*(\d+)\s*s/i.exec(String(videoOption || ''));
    return m ? `${m[1]}s` : null;
  };

  const lastLine = (el) => {
    const lines = D.textOf(el).split('\n').map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || '';
  };

  const normalizeModel = (name) =>
    String(name || '')
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}.]+/gu, ' ')
      .trim()
      .toLowerCase();

  /**
   * Match the side panel's model name against the names Flow's menu lists.
   *
   * Exact after normalising punctuation, brackets and emoji first, so
   * "🍌 Nano Banana Pro" and "Veo 3.1 - Fast [Lower Priority]" survive
   * cosmetic differences. Failing that, the closest name that contains the
   * model's family word and shares at least two words with it. Anything
   * weaker is no match: generating with a model the user did not choose is
   * worse than keeping Flow's current one and saying so.
   */
  const matchModel = (wanted, labels) => {
    const w = normalizeModel(wanted);
    const exact = labels.find((l) => normalizeModel(l) === w);
    if (exact) return { label: exact, exact: true };
    const words = w.split(' ').filter(Boolean);
    const family = words.find((t) => /\p{L}/u.test(t));
    let best = null;
    for (const label of labels) {
      const lw = normalizeModel(label).split(' ').filter(Boolean);
      if (!family || !lw.includes(family)) continue;
      const shared = lw.filter((t) => words.includes(t)).length;
      if (shared < 2) continue;
      const score = shared / new Set([...lw, ...words]).size;
      if (!best || score > best.score) best = { label, score };
    }
    return best ? { label: best.label, exact: false } : null;
  };

  /**
   * Click a trigger until the overlay it owns is actually on screen.
   *
   * MEASURED on the live app 2026-09-16: a panel dismissed by an Escape
   * keypress never tells its trigger, so the trigger still believes the panel
   * is open and its next click merely "closes" the already-closed panel,
   * opening nothing. The click after that opens it. Isolated cleanly: close
   * the settings panel by its trigger and one click reopens it; close it with
   * Escape alone and the next click does nothing. Waiting longer was never
   * the answer — 0, 300, 1000 and 2000 ms all behaved the same — so this
   * clicks again instead. driver.anyOverlayOpen no longer counts tooltips,
   * which stops most of those stray Escapes being sent at all; this is the
   * belt to that pair of braces, and it equally covers a click Flow drops for
   * any other reason.
   *
   * Polls before every click, so an overlay that opened late is never toggled
   * back shut, and keeps the same total budget the single wait used to have.
   */
  const openByTrigger = async (trigger, found, { what = 'panel', attempts = 3, timeout = 2000, cancelled } = {}) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const already = found();
      if (already) return already;
      D.click(trigger, what);
      const opened = await D.waitFor(found, { timeout, label: what, cancelled }).catch((e) => {
        if (e && e.cancelled) throw e;
        return null;
      });
      if (opened) return opened;
      if (attempt + 1 < attempts) log.info(`${what} did not open — clicking it again`);
    }
    return found();
  };

  /** Open the Settings trigger's panel and return the element to search in. */
  const openPromptBoxSettings = async (cancelled) => {
    const found = () => {
      const settings = $(S.promptBoxSettings);
      if (settings) return settings;
      const p = $(S.overlayPane);
      if (p && $$(S.toggleOption, p).length) return p;
      return $$(S.toggleOption).length ? document : null;
    };
    const already = found();
    if (already) return already;
    const trigger = D.byLabel(S.settingsTriggerLabel);
    if (!trigger) return null;
    return openByTrigger(trigger, found, { what: 'prompt box settings', cancelled });
  };

  /**
   * Pick one toggle inside its labelled group. Re-resolved on every call:
   * choosing Video swaps the controls under it, and a group captured before
   * that would be detached. If Flow ever drops the group labels, the whole
   * panel is searched instead, which is how this worked before the groups
   * were mapped.
   */
  const pickToggle = async (groupLabel, wanted, what, applied, { optional = false, cancelled } = {}) => {
    const panel = () => $(S.promptBoxSettings) || $(S.overlayPane) || document;
    // Groups render with the panel, except the ones a mode switch adds, so a
    // short wait — and none at all when this is not the grouped panel.
    const group = $(S.promptBoxSettings)
      ? await D.waitFor(() => $(S.toggleGroup(groupLabel), panel()), {
          timeout: optional ? 700 : 1500,
          interval: 100,
          label: `the ${what} control`,
          cancelled,
        }).catch((e) => {
          if (e && e.cancelled) throw e;
          return null;
        })
      : null;
    const scope = group || panel();
    const el = D.byLastLine(S.toggleOption, wanted, scope);
    if (!el) {
      if (optional && !group) {
        log.info(`Flow offers no ${what} choice for this model, so it decides that itself`);
        return false;
      }
      const offered = group ? $$(S.toggleOption, group).map(lastLine).filter(Boolean) : [];
      log.warn(`${what} "${wanted}" not offered by Flow${offered.length ? ` (it offers ${offered.join(', ')})` : ''}`);
      return false;
    }
    if (D.isChecked(el)) {
      applied.push(`${what} ${wanted} (already)`);
      return true;
    }
    if (D.isDisabled(el)) {
      log.warn(`${what} "${wanted}" is not available with Flow's current model`);
      return false;
    }
    D.click(el, `${what} ${wanted}`);
    applied.push(`${what} ${wanted}`);
    await sleep(150);
    return true;
  };

  /**
   * Choose the model family. The menu is a mat-menu with a backdrop of its
   * own, and it sits over the settings panel, which closes on outside clicks
   * EXCEPT those inside the model menu or on its backdrop — so the menu is
   * closed through its backdrop and never with dismissOverlays, which would
   * press Escape and take the settings panel down with it.
   */
  const pickModel = async (wanted, applied, cancelled) => {
    const trigger = D.byLabel(S.modelPickerLabel, $(S.promptBoxSettings) || document);
    if (!trigger) {
      log.warn(`Flow shows no model picker here, so "${wanted}" was not selected`);
      return false;
    }
    const current = D.textOf(trigger)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^[a-z][a-z0-9_]*$/.test(l))
      .join(' ');
    if (current && normalizeModel(current) === normalizeModel(wanted)) {
      applied.push(`model ${current} (already)`);
      return true;
    }
    D.click(trigger, 'model picker');
    const menu = await D.waitFor(() => $(S.modelMenuPanel), { timeout: 4000, label: 'the model menu', cancelled }).catch(
      (e) => {
        if (e && e.cancelled) throw e;
        return null;
      }
    );
    const closeMenu = async () => {
      if (!$(S.modelMenuPanel)) return;
      const backdrop = $(S.overlayBackdrop);
      if (backdrop) backdrop.click();
      await D.waitFor(() => !$(S.modelMenuPanel), { timeout: 2000, label: 'the model menu to close' }).catch(() => null);
    };
    if (!menu) {
      log.warn(`The model menu did not open, so "${wanted}" was not selected`);
      return false;
    }
    const items = $$(S.menuItem, menu)
      .map((el) => ({ el, label: lastLine(el.querySelector(S.menuItemLabel) || el) }))
      .filter((i) => i.label);
    const match = matchModel(wanted, items.map((i) => i.label));
    if (!match) {
      log.warn(
        `Model "${wanted}" is not offered by Flow (it offers ${items.map((i) => i.label).join(', ') || 'nothing'}), so Flow keeps ${current || 'its current model'}`
      );
      await closeMenu();
      return false;
    }
    const item = items.find((i) => i.label === match.label);
    if (D.isDisabled(item.el)) {
      log.warn(`Model "${item.label}" is listed but not available to this account, so Flow keeps ${current || 'its current model'}`);
      await closeMenu();
      return false;
    }
    D.click(item.el, `model ${item.label}`);
    await sleep(200);
    await closeMenu();
    applied.push(`model ${item.label}`);
    if (!match.exact) log.warn(`Flow has no model named "${wanted}"; picked the closest, "${item.label}"`);
    return true;
  };

  const applyPromptBoxSettings = async (payload, cancelled) => {
    if (!$(S.promptBoxDirect)) return false; // agent chat has no such panel
    if (!D.byLabel(S.settingsTriggerLabel) && !$(S.promptBoxSettings)) {
      log.warn('Direct prompt box has no Settings trigger — using whatever it is set to');
      return false;
    }
    const panel = await openPromptBoxSettings(cancelled);
    if (!panel) {
      log.warn('Prompt box settings did not open');
      await D.dismissOverlays();
      return false;
    }

    const applied = [];
    const video = isVideo(payload);
    // Image unless the payload explicitly asks for video.
    await pickToggle(S.settingsGroups.mode, video ? S.modeOptionText.video : S.modeOptionText.image, 'mode', applied, {
      cancelled,
    });
    // Every video prompt is set up on Ingredients. Text-to-video sends no
    // ingredients at all, and image-to-video pastes its frames as ingredients
    // first and switches to Frames afterwards, which is the switch that makes
    // Flow turn them into the start and end frames.
    if (video) {
      await pickToggle(S.settingsGroups.videoType, S.videoTypeText.ingredients, 'video type', applied, { cancelled });
    }
    if (payload.model) await pickModel(String(payload.model), applied, cancelled);
    if (payload.aspectRatio) {
      const wanted = String(payload.aspectRatio);
      await pickToggle(S.settingsGroups.ratio, S.ratioLabels[wanted.toLowerCase()] || wanted, 'ratio', applied, {
        cancelled,
      });
    }
    if (video && durationLabel(payload.videoOption)) {
      await pickToggle(S.settingsGroups.duration, durationLabel(payload.videoOption), 'duration', applied, {
        optional: true,
        cancelled,
      });
    }
    if (payload.outputCount) {
      await pickToggle(S.settingsGroups.count, `x${payload.outputCount}`, 'count', applied, { cancelled });
    }

    await sleep(200);
    await D.dismissOverlays();
    log.info(`Prompt box set: ${applied.join(', ') || 'no changes'}`);
    return true;
  };

  /** Flip only the video type, e.g. to Frames once the frames are attached. */
  const switchVideoType = async (label, cancelled) => {
    const panel = await openPromptBoxSettings(cancelled);
    if (!panel) return false;
    const applied = [];
    const ok = await pickToggle(S.settingsGroups.videoType, label, 'video type', applied, { cancelled });
    await sleep(200);
    await D.dismissOverlays();
    return ok;
  };

  // =====================================================================
  // Step 4 — reference images (image-to-image)
  // =====================================================================
  /**
   * How an image reaches a prompt on Flow's Angular UI, read from Flow's own
   * production JavaScript on 2026-09-14 (see selectors.js, "reference
   * images").
   *
   * The old build set files on an <input type=file> inside the add menu.
   * There is no such input any more: "Add ingredients" opens a media picker,
   * and its "Upload media" entry creates a hidden input only when clicked.
   * Waiting for an input that never exists is what produced "Could not find
   * Flow's image upload input" on every image-to-image prompt.
   *
   * The composer takes pasted images directly. Its editor collects every
   * clipboard item whose type starts with "image/" and hands them to the
   * prompt box, which uploads each one and adds it to the prompt as a
   * reference: a loading chip first, then the finished one. So the engine
   * pastes the files and waits for the chips to settle.
   *
   * Two things make this more than a paste:
   *
   *   - An uploaded reference is project media. It lands in the grid at
   *     index 0 like any output, and the media-id diff would otherwise
   *     download the user's own reference image as this prompt's result.
   *     The ids that appear while attaching are returned so the caller can
   *     rule them out.
   *   - Whatever is already in the prompt box is sent too. Flow clears it
   *     after each submit by default, but that is a user setting, and a
   *     prompt that failed after attaching leaves its chips behind. Image
   *     prompts therefore start from an empty set of references.
   */
  const UPLOAD_TIMEOUT_MS = 120000;
  const CHIP_APPEAR_MS = 20000;
  const SHORT_SETTLE_MS = 5000;
  const CONSENT_CANCEL_SETTLE_MS = 4000;
  const UPLOAD_TILE_WAIT_MS = 10000;

  const IMAGE_MIME_BY_EXT = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', heif: 'image/heif', heic: 'image/heic',
  };
  const IMAGE_EXT_BY_MIME = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/heif': 'heif', 'image/heic': 'heic',
  };

  const nonRetryable = (message, extra = {}) => Object.assign(new Error(message), { retryable: false }, extra);

  /** What the bytes are, whatever the name or the data URL claims. */
  const sniffImageType = (b) => {
    const at = (i, ...xs) => b.length >= i + xs.length && xs.every((x, k) => b[i + k] === x);
    if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
    if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
    if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
    if (at(4, 0x66, 0x74, 0x79, 0x70) && b.length >= 12) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (/^(hei[cmsx]|hev[cmsx])$/.test(brand)) return 'image/heic';
      if (/^(mif1|msf1|heif)$/.test(brand)) return 'image/heif';
    }
    return null;
  };

  /**
   * The side panel's {base64, name} as a File Flow will take.
   *
   * Flow accepts a file by its EXTENSION and decodes it only when the MIME
   * type starts with "image/", so both are made right here: the type comes
   * from the bytes (falling back to the data URL, then the extension), and a
   * name with no usable extension gets one. The user's own filename is kept
   * otherwise, since it is what Flow shows for the upload.
   */
  const toReferenceFile = (img, n) => {
    const raw = String((img && img.base64) || '');
    const comma = raw.indexOf(',');
    const isDataUrl = raw.startsWith('data:') && comma > 0;
    const declared = isDataUrl ? (raw.slice(5, comma).split(';')[0] || '').trim().toLowerCase() : '';
    const label = String((img && img.name) || '').split(/[\\/]/).pop().trim() || `reference image ${n}`;

    let bytes = null;
    try {
      const bin = atob((isDataUrl ? raw.slice(comma + 1) : raw).replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (_) {
      bytes = null;
    }
    if (!bytes || !bytes.length) return { error: `"${label}" arrived empty or corrupted` };

    let name = String((img && img.name) || '').split(/[\\/]/).pop().trim() || `reference-${n}`;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const mime =
      sniffImageType(bytes) || (declared.startsWith('image/') ? declared : '') || IMAGE_MIME_BY_EXT[ext] || '';
    if (!mime) return { error: `"${label}" is not an image` };
    if (!S.referenceImageExtensions.includes(ext)) {
      const add = IMAGE_EXT_BY_MIME[mime];
      if (!add) {
        return { error: `"${label}" is ${mime}, which Flow does not accept (${S.referenceImageExtensions.join(', ').toUpperCase()})` };
      }
      name = `${name}.${add}`;
    }
    if (bytes.length > S.referenceImageMaxBytes) {
      return { error: `"${label}" is ${(bytes.length / 1048576).toFixed(1)} MB, over Flow's 20 MB upload limit` };
    }
    if (name.length > S.referenceImageMaxNameLength) {
      const tail = `.${name.split('.').pop()}`;
      name = name.slice(0, S.referenceImageMaxNameLength - tail.length) + tail;
    }
    return { file: new File([bytes], name, { type: mime }), name };
  };

  const attachIngredients = async (payload, cancelled) => {
    const frames = /imageToVideo/i.test(String(payload.mode || ''));
    let wanted = (payload.images || []).filter(Boolean);
    const none = { count: 0, uploadIds: [] };

    // content.js counts images the panel referenced but never delivered.
    // Running such a prompt would draw it without the references it was
    // written around, which is the wrong picture, not a degraded one.
    const missing = Number(payload.missingImages) || 0;
    if (missing > 0) {
      throw nonRetryable(
        `${missing} reference image(s) for prompt ${payload.promptIndex} never reached the Flow tab, so it was not sent. Reload the Flow tab, then start the batch again from the side panel.`
      );
    }

    // A video takes a start frame and, optionally, an end frame: nothing more.
    if (frames && wanted.length > 2) {
      log.warn(
        `Prompt ${payload.promptIndex} has ${wanted.length} images, but a video takes a start and an end frame, so only the first two are used`
      );
      wanted = wanted.slice(0, 2);
    }

    await D.waitFor(() => $(S.promptEditor), { timeout: 15000, label: 'prompt editor', cancelled });

    const leftovers = D.ingredientChips().length;
    if (leftovers) {
      const { removed, remaining } = await D.clearIngredientChips({ cancelled });
      if (remaining) {
        throw nonRetryable(
          `Flow's prompt box still holds ${remaining} reference image(s) that could not be removed, and they would be sent with prompt ${payload.promptIndex}. Remove them in the Flow tab, then run the batch again.`
        );
      }
      log.info(`Removed ${removed} reference image(s) left in Flow's prompt box, so they are not sent with prompt ${payload.promptIndex}`);
    }

    const attached = wanted.length ? await attachImages(payload, wanted, cancelled) : none;
    // Image-to-video: the images went in as ingredients; switching the prompt
    // box to Frames is what makes Flow turn them into start and end frames.
    if (frames && attached.count) await setFrames(payload, attached.count, cancelled);
    if (isVideo(payload) && payload.speaker) await attachVoice(payload, cancelled);
    return attached;
  };

  const attachImages = async (payload, wanted, cancelled) => {
    const built = wanted.map((img, i) => toReferenceFile(img, i + 1));
    const problems = built.filter((b) => b.error).map((b) => b.error);
    if (problems.length) throw nonRetryable(`Prompt ${payload.promptIndex} was not sent: ${problems.join('; ')}`);
    const names = built.map((b) => b.name);
    log.info(`Attaching ${built.length} reference image(s) to prompt ${payload.promptIndex}: ${names.join(', ')}`);

    // Measured at the same moment as the paste: anything that appears in the
    // grid from here until the chips settle is an upload, not output.
    scrollGridToTop();
    const idsBefore = D.mediaIds();
    const snackbarsBefore = new Set(D.snackbars().map((s) => s.el));

    // Fetched only now. Removing the last leftover chip above rebuilt the
    // editor, and a paste dispatched on the element from before that lands on
    // a destroyed ProseMirror with no handler behind it.
    checkCancelled(cancelled);
    const editor = await D.waitFor(() => $(S.promptEditor), { timeout: 5000, label: 'prompt editor', cancelled });
    editor.focus();
    if (!D.pasteFiles(editor, built.map((b) => b.file))) {
      throw new Error(`Flow's prompt box did not take the pasted image(s). It may be disabled while Flow is busy.`);
    }

    const started = Date.now();
    let deadline = started + UPLOAD_TIMEOUT_MS;
    let consentSince = null;
    let consentGoneAt = null;
    let sawChip = false;
    let shortSince = null;
    for (;;) {
      checkCancelled(cancelled);

      const failed = D.snackbars().find((s) => !snackbarsBefore.has(s.el) && S.uploadErrorSignature.test(s.text));
      if (failed) throw new Error(`Flow could not upload the reference image: ${failed.text}`);

      // The rights question. Flow waits on it, so the engine does too, and
      // neither of its buttons is the engine's to press.
      if ($(S.uploadConsentDialog)) {
        if (consentSince === null) {
          consentSince = Date.now();
          log.warn(
            `Flow is asking you to confirm you have the rights to upload ${names.join(', ')}. Answer "Rights to use this image" in the Flow tab; the batch will wait. Flow only asks this once.`
          );
        }
        if (Date.now() - consentSince > S.consentWaitMs) {
          throw nonRetryable(
            `Flow's "Rights to use this image" question went unanswered for ${Math.round(S.consentWaitMs / 60000)} minutes, so nothing was uploaded.`,
            { halt: true }
          );
        }
        await sleep(500);
        continue;
      }
      if (consentSince !== null && consentGoneAt === null) {
        consentGoneAt = Date.now();
        deadline = Math.max(deadline, consentGoneAt + UPLOAD_TIMEOUT_MS);
        log.info('The rights question was answered, continuing the upload');
      }

      const chips = D.ingredientChips();
      if (chips.length) sawChip = true;
      const busy = chips.some((c) => c.busy);
      if (chips.length >= built.length && !busy) break;

      // Cancel drops every image without a word, so an empty bar a few
      // seconds after the question closes is the answer.
      if (consentGoneAt !== null && !chips.length && Date.now() - consentGoneAt > CONSENT_CANCEL_SETTLE_MS) {
        throw nonRetryable(
          `The upload was cancelled at Flow's "Rights to use this image" question, so nothing was sent.`,
          { halt: true }
        );
      }
      if (!sawChip && consentSince === null && Date.now() - started > CHIP_APPEAR_MS) {
        throw new Error(`Flow took the pasted image(s) but attached nothing within ${Math.round(CHIP_APPEAR_MS / 1000)}s`);
      }
      // Fewer chips than images and nothing still uploading: some were
      // dropped. Chips arrive one per image, so give stragglers a moment.
      if (sawChip && !busy && chips.length < built.length) {
        if (shortSince === null) shortSince = Date.now();
        if (Date.now() - shortSince > SHORT_SETTLE_MS) {
          throw new Error(`Flow attached only ${chips.length} of ${built.length} reference images to prompt ${payload.promptIndex}`);
        }
      } else {
        shortSince = null;
      }
      if (Date.now() > deadline) {
        throw new Error(`The reference image upload did not finish within ${Math.round(UPLOAD_TIMEOUT_MS / 1000)}s`);
      }
      await sleep(250);
    }

    const chips = D.ingredientChips();
    const unusable = chips.filter((c) => c.disabled).length;
    if (unusable) {
      throw nonRetryable(
        `Flow attached ${chips.length} reference image(s) but cannot use ${unusable} of them with the selected model, most likely more references than it takes. Lower "Max Input Images per Prompt" or choose another model.`
      );
    }

    // The uploads are project media now, and they are about to sit at the
    // top of the grid next to this prompt's output. Wait until they have
    // rendered so the caller's snapshot contains them. A filtered grid may
    // never show them, which is harmless: there is then nothing to confuse.
    scrollGridToTop();
    let uploadIds = [];
    await D.waitFor(
      () => {
        uploadIds = [...D.mediaIds()].filter((id) => !idsBefore.has(id));
        return uploadIds.length >= built.length ? true : null;
      },
      { timeout: UPLOAD_TILE_WAIT_MS, interval: 250, label: 'the uploaded images to appear in the grid', cancelled }
    ).catch((e) => {
      if (e && e.cancelled) throw e;
    });

    log.info(
      `Attached ${chips.length} reference image(s) to prompt ${payload.promptIndex} in ${Math.round((Date.now() - started) / 1000)}s`
    );
    return { count: chips.length, uploadIds };
  };

  /**
   * Turn the attached images into the start (and end) frame.
   *
   * In Frames mode the bar shows two slots, and Flow fills them from the
   * image references already in the prompt at the moment the mode changes:
   * the first becomes the start frame, the second the end frame. Pasting into
   * Frames mode directly would not work — a pasted image is a reference, and
   * Frames mode shows and sends frames only.
   */
  const setFrames = async (payload, count, cancelled) => {
    const want = Math.min(count, 2);
    if (!(await switchVideoType(S.videoTypeText.frames, cancelled))) {
      throw new Error(`Could not switch Flow's prompt box to Frames for prompt ${payload.promptIndex}`);
    }
    const set = await D.waitFor(() => ($$(S.frameChip).length >= want ? true : null), {
      timeout: 5000,
      label: 'the frames to be set',
      cancelled,
    }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (!set) {
      throw new Error(
        `Flow did not turn the uploaded ${want === 2 ? 'images into start and end frames' : 'image into a start frame'} for prompt ${payload.promptIndex}`
      );
    }
    log.info(`Prompt ${payload.promptIndex}: ${want === 2 ? 'start and end frames' : 'start frame'} set`);
  };

  /**
   * Attach the speaker's voice through the add-ingredients menu.
   *
   * Voices are listed under the menu's "Voices" category and named by the
   * server, so the name is searched for, not assumed. The menu also holds
   * "Upload media", which opens the OS file chooser, and a "Delete voice"
   * button on every voice: only button.asset-item is ever clicked.
   *
   * The same button opens one of two menus (selectors.addMenuMobile). The
   * desktop popover has category tabs, and takes two clicks on a voice —
   * select, then add. The full-screen dialog Flow shows in a narrow viewport,
   * i.e. whenever the side panel is open, has a category dropdown instead,
   * and one click adds the voice and closes it.
   *
   * A voice that cannot be found or attached is reported and the prompt still
   * runs, as it did in the old build.
   */
  const attachVoice = async (payload, cancelled) => {
    const name = String(payload.speaker).trim();
    const n = payload.promptIndex;
    const chipsBefore = D.ingredientChips().length;
    const openMenu = () => $(S.addMenuPopover) || $(S.addMenuMobile);
    const closeMenu = async () => {
      const mobile = $(S.addMenuMobile);
      const close = mobile
        ? $(S.addMenuMobileClose, mobile)
        : $(S.addMenuCloseButton, $(S.addMenuPopover) || document);
      if (close) D.click(close, 'close the add-ingredients menu');
      await D.waitFor(() => !openMenu(), { timeout: 2000, label: 'the add-ingredients menu to close' }).catch(
        () => null
      );
      if (openMenu()) await D.dismissOverlays();
    };
    const giveUp = async (why) => {
      log.warn(`${why}, so prompt ${n} runs without the ${name} voice`);
      await closeMenu();
      return false;
    };

    const add = D.byLabel(S.addIngredientsLabel);
    if (!add) return giveUp('Flow shows no "Add ingredients" button');
    // The swallowed click that used to lose a prompt's settings hit this
    // button too on 2026-09-16 — see openByTrigger.
    const menu = await openByTrigger(add, openMenu, {
      what: 'the add-ingredients menu',
      cancelled,
    });
    if (!menu) return giveUp('The add-ingredients menu did not open');
    const mobile = !$(S.addMenuPopover);

    if (mobile) {
      const filter = $(S.addMenuFilterTrigger, menu);
      if (!filter) return giveUp('The add-ingredients menu has no category filter');
      // Each option is an icon ligature and then its label.
      const voicesOption = () =>
        $$(S.addMenuFilterOption).find((el) => lastLine(el) === S.voicesCategoryText) || null;
      const option = await openByTrigger(filter, voicesOption, { what: 'the category filter', cancelled });
      if (!option) return giveUp('The add-ingredients menu has no Voices category');
      D.click(option, 'Voices');
    } else {
      const tab = $$(S.addMenuCategoryTab, menu).find((el) => {
        const title = el.querySelector(S.addMenuCategoryTitle);
        return (title ? D.textOf(title) : lastLine(el)) === S.voicesCategoryText;
      });
      if (!tab) return giveUp('The add-ingredients menu has no Voices tab');
      D.click(tab, 'Voices');
    }

    const search = await D.waitFor(() => $(S.addMenuSearch, openMenu() || menu), {
      timeout: 3000,
      label: 'the asset search box',
      cancelled,
    }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (search) {
      search.value = name;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Only while a menu is up: the dialog's list goes with it, and a click on
    // an item of a menu that has closed must never happen.
    const findVoice = () => {
      const open = openMenu();
      if (!open) return null;
      return (
        $$(S.addMenuAssetItem, open).find(
          (el) => normalizeModel(D.textOf(el.querySelector(S.addMenuAssetTitle) || el)) === normalizeModel(name)
        ) || null
      );
    };
    const voice = await D.waitFor(findVoice, { timeout: 6000, label: `the ${name} voice`, cancelled }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (!voice) return giveUp(`Flow lists no voice named "${name}"`);

    const attached = () => (D.ingredientChips().length > chipsBefore ? true : null);
    D.click(voice, `voice ${name}`);
    // The dialog adds on this first click; the popover only selects. Look
    // before clicking again, or the dialog's voice would be added twice.
    const tookAtOnce = await D.waitFor(attached, {
      timeout: mobile ? 1500 : 300,
      interval: 100,
      label: `the ${name} voice to attach`,
      cancelled,
    }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (!tookAtOnce) {
      const again = findVoice();
      if (again) D.click(again, `voice ${name} (add to prompt)`);
    }

    const added = await D.waitFor(attached, {
      timeout: 5000,
      label: `the ${name} voice to attach`,
      cancelled,
    }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (!added) return giveUp(`The ${name} voice did not attach`);
    await closeMenu();
    log.info(`Prompt ${n}: attached the ${name} voice`);
    return true;
  };

  // =====================================================================
  // Step 5 — fill the composer and submit
  // =====================================================================
  const fillAndSubmit = async (payload, cancelled) => {
    checkCancelled(cancelled);
    await D.setPromptText(payload.prompt);
    log.info(`Prompt ${payload.promptIndex} typed`);

    const generate = await D.waitFor(
      () => {
        const b = D.byLabel(S.startGenerationLabel) || $(S.generateButton);
        return b && !b.disabled ? b : null;
      },
      { timeout: 10000, label: 'Start generation to become enabled', cancelled }
    );

    const mediaBefore = D.mediaIds().size;
    // MEASURED on the live app 2026-09-26: Flow's Start generation button
    // IGNORES a synthetic click. With the prompt typed by real keystrokes and
    // the button reporting itself enabled, both `el.click()` and a full
    // pointerover/pointerenter/pointerdown/mousedown/pointerup/mouseup/click
    // sequence left the composer untouched and nothing generating; a trusted
    // click submitted instantly. Nothing else on the page needs this — the
    // settings trigger, the model menu and the tile menus all take synthetic
    // clicks — so only this one control goes through the CDP bridge.
    //
    // The fallback is deliberate and matches what the original extension did
    // (it sent CC and dropped back to synthetic pointer events when CC
    // failed): if the bridge is unavailable the prompt at least has a chance,
    // and the submit wait below decides the truth either way.
    //
    // ORDERING DEPENDENCY, verified 2026-09-26: the frozen worker's "CC"
    // handler calls chrome.debugger.sendCommand WITHOUT attaching first —
    // only "CIT" attaches. setPromptText() above always sends CIT and throws
    // if it fails, so by this line the debugger is attached to this tab. Do
    // not reorder the submit before the typing, and do not add a path that
    // submits without typing: CC would fail, and the synthetic fallback it
    // drops to is the thing Flow ignores.
    //
    // A trusted click is hit-tested, so it lands on whatever is on top of the
    // button (MEASURED 2026-09-27: an add-assets dialog left open took the
    // click, gained a stray image and submitted nothing). Close what is open
    // first; clickTrusted then refuses outright if the button is still
    // covered, and that fails the prompt rather than clicking through.
    await D.dismissOverlays();
    let submitPath = 'trusted click';
    try {
      await D.clickTrusted(generate, 'Start generation');
    } catch (e) {
      if (e && e.covered) {
        log.warn(`Prompt ${payload.promptIndex}: ${e.message} — closing it and trying once more`);
        await D.dismissOverlays();
        await D.clickTrusted(generate, 'Start generation');
      } else {
        submitPath = 'synthetic click';
        log.warn(
          `Could not send a trusted click to Start generation (${e && e.message}) — falling back to a synthetic click, which Flow is likely to ignore`
        );
        D.click(generate, 'Start generation');
      }
    }
    reportProgress(payload, 10, 'generating');

    // Confirming the submission took is surface-dependent, and getting this
    // wrong is expensive.
    //
    // The agent chat swaps the generate button for a stop button, so the old
    // check waited on flow-stop-icon-button. The DIRECT prompt box has no
    // such button — so on 2026-09-08 21:30 every prompt submitted fine,
    // generated a real image, and was then declared "Timed out waiting for
    // generation to start" and RETRIED. Roughly 30 submissions, 10 images,
    // credits burnt, and every one of them logged as a failure.
    //
    // So accept any of the three things that actually mean "it went":
    // the busy swap, the composer clearing, or new media appearing.
    const submitted = await D.waitFor(
      () => {
        if (D.isBusy()) return 'busy indicator';
        if (D.composerEmpty()) return 'composer cleared';
        if (D.mediaIds().size > mediaBefore) return 'new media';
        return null;
      },
      { timeout: 15000, label: `generation to start after a ${submitPath}`, cancelled }
    ).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });

    if (submitted) {
      log.info(`Prompt ${payload.promptIndex} submitted (${submitted})`);
    } else {
      // Never fail here again. The evidence that matters is whether media
      // arrives, and awaitOutputs decides that on the media-id diff.
      log.warn(
        `Prompt ${payload.promptIndex}: no submit signal within 15s — continuing anyway and judging on whether media arrives`
      );
    }
    return true;
  };

  // =====================================================================
  // Step 6 — wait for the agent to finish, then diff the grid
  // =====================================================================
  /**
   * There is no percentage anywhere in the new UI — the agent reports in
   * prose. Progress is therefore a time-based estimate, capped below 100
   * until real outputs exist, so the panel's bar never claims completion
   * that has not happened.
   */
  // How long to keep watching after the agent's chat turn goes quiet.
  //
  // The chat going idle is NOT the same as generation finishing: on
  // 2026-09-08 prompt 2 was abandoned after 57s, and 69s later a tile landed
  // at index 0 during prompt 3's window and was credited to prompt 3 — a
  // paid generation both lost AND mis-attributed. Giving up early is the
  // expensive mistake here; waiting costs nothing but time.
  //
  // So: fail fast only when Flow has actually said something went wrong, and
  // be patient when it has merely gone quiet.
  const IDLE_GRACE_MS = 8000;
  const IDLE_PATIENCE_MS = 60000;
  // In direct mode nothing on the page says "working": no stop button, no
  // thinking indicator, no progress bar (sampled every 500ms across a whole
  // generation on 2026-09-09). Media or an error tile is the only evidence
  // there will ever be, so the wait is bounded by the clock alone — about
  // three times the 50-70s a generation was measured to take.
  const NO_CHAT_PATIENCE_MS = 180000;
  const ERROR_SIGNATURE = /agent failed|try again|went wrong|rate limit|quota|too many/i;

  // New output — and new failures — land at grid index 0. An unfamiliar id
  // deep in the grid is the virtual scroller re-materialising old media.
  const FRESH_WINDOW = 8;

  /** Failed generations Flow painted into the top of the grid. */
  const gridErrors = () => D.errorTiles().filter((e) => e.index < FRESH_WINDOW);

  /**
   * The agent's last words, for when a prompt produces nothing.
   *
   * Material icon ligatures render as their own text nodes inside the chat
   * bubble, so a raw textContent slice comes back looking like
   * "...atmosphere, 16:9. error The agent failed. thumb_up thumb_down
   * content_copy flag" and can cut mid-word. Drop the single-token lines
   * (chrome, not prose) and keep the tail, which is where the failure is.
   *
   * ONLY real chat bubbles count. The old fallback chain — last bubble, else
   * the chat scroller, else document.body — invented a reply whenever the
   * chat was empty, which in direct mode it always is. What it returned was
   * the chat's empty-state greeting, "Hi <name> / What would you like to
   * create?", and agentQuestionSignature matches that: every prompt was
   * declared a non-retryable clarifying question about sixteen seconds into
   * a generation that takes fifty to seventy. No bubbles now means no reply,
   * and no reply means nothing to diagnose from.
   */
  const lastAgentReply = () => {
    const bubbles = $$(S.chatBubble);
    if (!bubbles.length) return '';
    const text = D.textOf(bubbles[bubbles.length - 1])
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^[a-z][a-z0-9_]*$/.test(l))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 220 ? '…' + text.slice(-220) : text;
  };

  // A video generation takes minutes rather than seconds, and a "Lower
  // Priority" model can sit queued for a long while first. Its tile says so
  // (a pending tile with a percentage, or "Queued"), so the wait follows the
  // tile and this is only the outer bound.
  const VIDEO_TIMEOUT_MS = 30 * 60 * 1000;
  // With several videos requested, the rest may still be generating when the
  // first lands; this caps how long a pending tile that may not even be ours
  // can hold a finished prompt back.
  const VIDEO_STRAGGLER_MS = 10 * 60 * 1000;

  const awaitOutputs = async (payload, before, cancelled, timeoutMs = 420000, errorsBefore = null) => {
    const video = isVideo(payload);
    const started = Date.now();
    const expected = video ? 120000 : 45000; // observed: ~20s for one image; leave headroom
    const wantedCount = Math.max(1, Number(payload.outputCount) || 1);
    let lastPct = 10;
    let idleSince = null;
    let nudged = false;
    let patientLogged = false;
    let firstFreshAt = null;

    // Error tiles already in the grid belong to earlier prompts. Measured at
    // the same moment as the media snapshot where the caller supplies it, so
    // a failure that lands within the first poll cannot be mistaken for one
    // that was already there.
    const baselineErrors = errorsBefore === null ? gridErrors().length : errorsBefore;
    const recycled = new Set();
    // A finished tile is this prompt's output when none of its keys was on the
    // grid before the prompt went in. Images are keyed by data-media-id,
    // videos by their media URL (see gridTiles). A tile still generating has
    // no key yet and is counted separately, with its percentage.
    const scan = () => {
      const fresh = [];
      let pending = 0;
      let percent = null;
      for (const t of D.gridTiles()) {
        const isNew = t.keys.length > 0 && !t.failed && !t.keys.some((k) => before.has(k));
        if (t.index >= FRESH_WINDOW) {
          if (isNew && !t.pending) recycled.add(t.keys[0]);
          continue;
        }
        if (t.pending) {
          pending++;
          if (t.percent !== null) percent = Math.max(percent === null ? 0 : percent, t.percent);
          continue;
        }
        if (isNew) fresh.push(t.keys[0]);
      }
      return { fresh, pending, percent };
    };
    const finish = (fresh) => {
      reportProgress(payload, 100, 'completed');
      log.info(`Prompt ${payload.promptIndex}: ${fresh.length} output(s) ready`);
      return fresh;
    };

    for (;;) {
      checkCancelled(cancelled);

      const busy = D.isBusy();
      const { fresh, pending, percent } = scan();

      if (video) {
        // A video is done when its tile has a video in it and nothing new near
        // the top is still generating, or when every requested video is in.
        if (fresh.length > 0 && firstFreshAt === null) firstFreshAt = Date.now();
        if (fresh.length > 0 && (pending === 0 || fresh.length >= wantedCount)) return finish(fresh);
        if (fresh.length > 0 && Date.now() - firstFreshAt > VIDEO_STRAGGLER_MS) {
          log.warn(
            `Prompt ${payload.promptIndex}: ${fresh.length} video(s) ready and another tile is still generating after ${Math.round(VIDEO_STRAGGLER_MS / 60000)} minutes — downloading what is ready`
          );
          return finish(fresh);
        }
      } else if (!busy && fresh.length > 0) {
        return finish(fresh);
      }

      // A failed generation is a TILE, not a sentence. Flow renders it at
      // index 0 with no data-media-id, so the media diff walks straight past
      // it — before this was mapped, a run that Flow had already refused
      // could only be reported as a timeout, or worse, guessed at.
      const errorsNow = gridErrors();
      if (errorsNow.length > baselineErrors) {
        const worst = errorsNow[0];
        const message = worst.text || worst.title || 'Flow reported a failed generation';
        // "You've reached your usage limit. Please try again later." cannot
        // be cleared by trying again inside the same batch; every remaining
        // prompt would hit the same wall. Flag it so the batch can stop.
        //
        // "We noticed some unusual activity" is worse than that, and is
        // checked first: it is Flow's anti-automation notice (measured live
        // 2026-09-10, after eight quick retries of a prompt it kept
        // refusing). A quota refusal is a wall that clears on its own; this
        // one gets WORSE with every retry, because the retry is the flagged
        // behaviour. Neither is retryable, both stop the batch, and they are
        // reported differently because the user's next move differs: wait
        // for a reset, versus stop automating this account for a while.
        const blocked = S.blockedSignature.test(message);
        const outOfQuota = !blocked && S.quotaSignature.test(message);
        const err = new Error(`Flow could not generate this prompt: ${message}`);
        err.retryable = !outOfQuota && !blocked;
        err.quota = outOfQuota;
        err.blocked = blocked;
        if (blocked) {
          log.error(`Flow has flagged this session as unusual activity: ${message}`);
        } else if (outOfQuota) {
          log.error(`Flow is out of quota: ${message}`);
        }
        throw err;
      }

      // A video tile that is still generating is the evidence of work that
      // the direct prompt box otherwise never shows.
      const working = busy || (video && pending > 0);
      if (working) {
        idleSince = null;
      } else if (Date.now() - started > 8000) {
        // Only a chat bubble can say "I answered and stopped". In direct
        // mode there is no chat at all, so there is nothing here to read and
        // nothing to infer: media or an error tile is the whole story, and
        // the wait is bounded by the clock.
        const chatting = D.hasChat();
        const reply = chatting ? lastAgentReply() : '';
        // A clarifying question means the agent answered and stopped - it is
        // not still working - so it must not consume the patient wait.
        const isQuestion = !!reply && S.agentQuestionSignature.test(reply);
        const failedOutright = !!reply && (ERROR_SIGNATURE.test(reply) || isQuestion);
        // Keyed to whether there is a REPLY, not to whether a chat element
        // exists. Releasing the Agent chip can leave the panel on screen
        // with an empty conversation, and "the chat went quiet" is the wrong
        // story for a chat that never spoke: the 60s patient window would
        // expire at ~68s against a generation measured at 50-70s.
        const grace = failedOutright
          ? IDLE_GRACE_MS
          : reply
            ? IDLE_PATIENCE_MS
            : NO_CHAT_PATIENCE_MS;
        // Idle with nothing new. Two cheap explanations have to be ruled out
        // before blaming Flow: the tile may not have painted yet, and the
        // scroller may simply be parked away from index 0. Only a sustained
        // idle with an empty diff means the agent answered without
        // generating (a clarifying question, a refusal, or a rate limit).
        if (idleSince === null) idleSince = Date.now();
        if (!nudged) {
          nudged = true;
          scrollGridToTop();
          await sleep(800);
          const retry = scan().fresh;
          if (retry.length > 0 && !video) return finish(retry);
        }
        if (!failedOutright && !patientLogged) {
          patientLogged = true;
          log.info(
            reply
              ? `Prompt ${payload.promptIndex}: the chat went quiet with no error — giving Flow up to ${Math.round(IDLE_PATIENCE_MS / 1000)}s more in case the image is still landing`
              : `Prompt ${payload.promptIndex}: submitted, and ${chatting ? 'the chat has said nothing' : 'direct mode shows no progress anywhere'} — waiting up to ${Math.round(NO_CHAT_PATIENCE_MS / 1000)}s for the ${video ? 'video' : 'image'} or an error tile`
          );
        }
        if (Date.now() - idleSince > grace) {
          if (recycled.size) {
            log.warn(
              `Ignored ${recycled.size} tile(s) that appeared deep in the grid — those are older media the scroller re-rendered, not this prompt's output`
            );
          }
          // Flow's agent chat answers a story-shaped prompt with questions
          // rather than pictures. Observed 2026-09-08: the same prompt went in
          // five times and came back with five clarifying questions and zero
          // images. Resending identical text cannot change that, so this is a
          // failure the batch must NOT spend retries on.
          if (isQuestion) {
            const err = new Error(
              `Flow asked a question instead of generating: "${reply.slice(-160)}" — this prompt reads as a brief, not a picture. Describe the image you want, or switch the prompt box to Image mode.`
            );
            err.retryable = false;
            throw err;
          }
          throw new Error(
            reply
              ? `Flow finished without producing media. Last reply: ${reply}`
              : `Flow produced neither media nor an error within ${Math.round(grace / 1000)}s of going quiet`
          );
        }
      }

      if (Date.now() - started > timeoutMs) {
        throw new Error(`Generation timed out after ${Math.round(timeoutMs / 1000)}s`);
      }

      // Flow's own percentage when a video tile shows one; otherwise an
      // estimate that never claims completion.
      const pct =
        percent !== null
          ? Math.max(10, Math.min(95, percent))
          : Math.min(95, 10 + Math.round(((Date.now() - started) / expected) * 85));
      if (pct !== lastPct) {
        lastPct = pct;
        reportProgress(payload, pct, 'generating');
      }
      await sleep(1000);
    }
  };

  // =====================================================================
  // Step 7 — download, cascading down the quality tiers
  // =====================================================================
  const firstLine = (el) => D.textOf(el).split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';

  const downloadOne = async (mediaId, payload, cancelled) => {
    const tile = D.tileForMediaId(mediaId);
    if (!tile) throw new Error(`Tile ${mediaId} is no longer rendered`);
    const video = !!tile.querySelector(S.videoTile);
    D.scrollIntoView(tile);
    await sleep(150);

    const more = D.byLabel(S.tileMoreOptionsLabel, tile);
    if (!more) throw new Error('Tile "More options" button not found');
    D.click(more, 'More options');

    const dl = await D.waitFor(() => D.menuItemByText(S.textFallbacks.Download), {
      timeout: 6000,
      label: 'Download menu item',
      cancelled,
    });
    D.click(dl, 'Download');

    // Start from the requested size and fall down; skip anything the plan
    // does not allow. Images and videos speak different vocabularies — the
    // panel offers 1k/2k/4k for images and 720/1080/4k for videos, and Flow's
    // submenus read "1K", "2K", "4K" and "720p", "1080p", "4K" — so the value
    // is translated for the kind of tile this is. Matching the raw value
    // fails silently and just hands back a different size.
    const requested = String(payload.autoDownloadResourceQuality || (video ? '720' : '2k')).toLowerCase();
    const labels = video ? S.videoQualityLabels : S.qualityLabels;
    const ladder = video ? S.videoQualityLadder : S.qualityLadder;
    const wanted = labels[requested] || null;
    const start = wanted ? ladder.indexOf(wanted) : -1;
    const order =
      start >= 0
        ? ladder.slice(start)
        : [wanted, ...ladder].filter(Boolean);
    if (start < 0) {
      log.warn(
        video
          ? `Tier "${requested}" is not one of Flow's video download sizes — trying ${order.join(' -> ')}`
          : `Tier "${requested}" is not one of Flow's observed image tiers — trying ${order.join(' -> ')}`
      );
    }

    // The sizes submenu — or nothing. With a single size on offer Flow opens
    // no submenu at all: the Download item downloads that size itself.
    const sizes = () => $$(S.menuItem).filter((el) => S.downloadSizeLabel.test(firstLine(el)));
    const submenu = await D.waitFor(() => (sizes().length ? true : null), {
      timeout: 2500,
      interval: 150,
      label: 'download sizes',
      cancelled,
    }).catch((e) => {
      if (e && e.cancelled) throw e;
      return null;
    });
    if (!submenu) {
      await D.dismissOverlays();
      log.info(`Downloading ${mediaId} in the one size Flow offers for it`);
      return { tier: 'only', mediaId };
    }

    for (const label of order) {
      const item = sizes().find((el) => firstLine(el) === label);
      if (!item) continue;
      // The live submenu greys out the paywalled tier rather than labelling
      // it, so the disabled state is the signal that matters; the "Upgrade"
      // text is kept as a secondary one in case Flow changes its mind.
      if (D.isDisabled(item) || D.textOf(item).includes(S.upgradeButtonText)) {
        log.warn(`${label} is not available on this Google plan — trying the next tier down`);
        continue;
      }
      D.click(item, `${label} download`);
      log.info(`Downloading ${mediaId} at ${label}`);
      await sleep(800);
      await D.dismissOverlays();
      return { tier: label, mediaId };
    }

    // Nothing on the ladder was available: a video can still be had at the
    // size it was generated in. The animated GIF is never a substitute.
    if (video) {
      const original = sizes().find((el) => /original size/i.test(D.textOf(el)) && !D.isDisabled(el));
      if (original) {
        const label = firstLine(original);
        D.click(original, `${label} download`);
        log.info(`Downloading ${mediaId} at ${label}, the size it was generated in`);
        await sleep(800);
        await D.dismissOverlays();
        return { tier: label, mediaId };
      }
    }

    // Menu path exhausted — fall back to the rendered media itself.
    await D.dismissOverlays();
    const media = video ? tile.querySelector('video[src]') : tile.querySelector(S.mediaImage);
    const src = media && (media.src || media.getAttribute('src'));
    if (src) {
      const res = await D.sendAsync({
        type: 'DOWNLOAD_VIDEO',
        url: src,
        filename: `${payload.promptIndex}_${slug(payload.prompt)}.${video ? 'mp4' : 'png'}`,
        folder: (payload.folderName || '').trim(),
        autoChangeFileName: payload.autoChangeFileName !== false,
      });
      if (res && res.success) {
        log.warn(`Fell back to direct download for ${mediaId} (display resolution)`);
        return { tier: 'direct', mediaId };
      }
    }
    throw new Error(`No usable download option for ${mediaId}`);
  };

  const downloadOutputs = async (mediaIds, payload, cancelled) => {
    if (String(payload.autoDownloadResourceQuality) === 'no-download') {
      log.info(`Skipping download for prompt ${payload.promptIndex} (no-download)`);
      return [];
    }

    // Tell the service worker how to name what is about to arrive. Same
    // contract as the old bundle, so the existing filename logic applies.
    D.send({
      type: 'SET_FOLDER_NAME',
      folderName: (payload.folderName || '').trim(),
      prefix: `${payload.promptIndex}_${slug(payload.prompt)}_`,
      autoChangeFileName: payload.autoChangeFileName !== false,
    });

    const done = [];
    for (const id of mediaIds) {
      checkCancelled(cancelled);
      try {
        done.push(await downloadOne(id, payload, cancelled));
      } catch (e) {
        if (e && e.cancelled) throw e;
        log.error(`Download failed for ${id}: ${e.message}`);
        await D.dismissOverlays();
      }
    }
    return done;
  };

  // =====================================================================
  // The machine
  // =====================================================================
  const runPrompt = async (payload, { cancelled, applySettings = false, onPhase } = {}) => {
    const steps = [
      { name: 'Open Project', status: 'pending' },
      { name: 'Attach Images', status: 'pending' },
      { name: 'Fill Prompt', status: 'pending' },
      { name: 'Generate', status: 'pending' },
      { name: 'Download Output', status: 'pending' },
    ];
    const mark = (i, status, error) => {
      steps[i].status = status;
      if (error) steps[i].error = error;
    };
    // Reported back so the batch knows whether it still owes Flow a settings
    // write: a prompt that dies before this step must not consume the slot.
    let settingsApplied = false;

    try {
      checkCancelled(cancelled);

      mark(0, 'running');
      await ensureProject(cancelled);
      await ensureAgentPanel(cancelled);
      // Before anything is typed: the same composer either talks to a chat
      // agent or generates, and only the second one is automatable.
      await ensureDirectMode(cancelled);
      mark(0, 'completed');

      // The direct box's own settings are always worth setting when that box
      // is the one on screen: it is the only place Image vs Video lives.
      await applyPromptBoxSettings(payload, cancelled);
      if (applySettings) settingsApplied = await applyAgentSettings(payload, cancelled);

      // Runs for every prompt, not only those carrying images: an image
      // prompt's references must not ride along with the next prompt.
      mark(1, 'running');
      const attached = await attachIngredients(payload, cancelled);
      if (!attached.count) steps[1].name = 'Attach Images (Skipped)';
      mark(1, 'completed');

      // Snapshot BEFORE submitting; the diff against this is what identifies
      // this prompt's outputs. Taken with the grid parked at index 0 AND only
      // once it has stopped painting, so the scroller cannot fake a new tile.
      const before = await settledMediaIds({ cancelled });
      // The reference images just uploaded are media too, at the top of the
      // grid. They are never this prompt's output, painted in time or not.
      for (const id of attached.uploadIds) before.add(id);
      // Taken with the same grid, at the same moment: a failure tile already
      // on screen belongs to an earlier prompt, and only an increase counts.
      const errorsBefore = gridErrors().length;

      mark(2, 'running');
      await fillAndSubmit(payload, cancelled);
      mark(2, 'completed');

      mark(3, 'running');
      const fresh = await awaitOutputs(payload, before, cancelled, isVideo(payload) ? VIDEO_TIMEOUT_MS : undefined, errorsBefore);
      mark(3, 'completed');

      // Say so the moment output exists, before the download starts.
      //
      // The side panel draws one chip per prompt and has four states for it,
      // one of which — "Submitted" — it renders for a result that succeeded
      // with downloadComplete still false. Nothing ever produced that state,
      // because a single result was pushed at the very end of the prompt: the
      // chip sat on "Running" through the whole 27-70s generation AND the
      // download, which is what makes the batch look frozen. This callback is
      // the only sub-prompt progress the frozen panel is capable of showing.
      if (typeof onPhase === 'function') {
        try {
          onPhase('generated', fresh);
        } catch (_) {
          /* progress reporting must never fail a prompt */
        }
      }

      mark(4, 'running');
      const downloads = await downloadOutputs(fresh, payload, cancelled);
      mark(4, 'completed');

      return { success: true, steps, mediaIds: fresh, downloads, settingsApplied };
    } catch (e) {
      if (e && e.cancelled) {
        log.warn(`Prompt ${payload.promptIndex} cancelled`);
        return { success: false, cancelled: true, steps, error: 'Cancelled', settingsApplied };
      }
      const i = steps.findIndex((s) => s.status === 'running');
      if (i >= 0) mark(i, 'error', e.message);
      log.error(`Prompt ${payload.promptIndex} failed: ${e.message}`);
      return {
        success: false,
        steps,
        error: e.message,
        settingsApplied,
        retryable: e.retryable !== false,
        quota: !!e.quota,
        blocked: !!e.blocked,
        halt: !!e.halt,
      };
    }
  };

  FA.stepMachine = {
    runPrompt,
    attachIngredients,
    matchModel,
    durationLabel,
    ensureDirectMode,
    applyPromptBoxSettings,
    scrollGridToTop,
    settledMediaIds,
    gridErrors,
    ensureProject,
    applyAgentSettings,
    awaitOutputs,
    downloadOutputs,
    slug,
  };
})();
