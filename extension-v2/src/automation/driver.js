/**
 * Flow Automata — DOM interaction primitives for Flow's Angular UI.
 *
 * Everything the step machine does to the page goes through here, so the
 * "how do we click things" decision lives in one place.
 *
 * Two findings from driving the live UI on 2026-09-07 shape this file:
 *
 *   - Angular Material honours SYNTHETIC clicks. `button.click()` opened the
 *     tile menu and its Download submenu. So the default click path needs no
 *     coordinates, no zoom maths, and no debugger attach — a large
 *     simplification over the old coordinate-based CDP clicking.
 *   - ProseMirror does NOT accept `el.textContent = ...`. Text has to arrive
 *     as real input, which is what the service worker's CDP `Input.insertText`
 *     bridge (`CIT`) provides. That path is verified working.
 *
 * The CDP click (`clickTrusted`) is kept for controls that turn out to check
 * `event.isTrusted`, but it is opt-in rather than the default.
 */
(function () {
  'use strict';

  const FA = (globalThis.FA = globalThis.FA || {});
  const S = FA.selectors;

  // Deliberately a page timer. MEASURED 2026-09-15: in a background tab Chrome
  // stretches these to 1s, and to 60s per wake-up unless the page holds a
  // WebRTC connection (content.js opens one for each batch). Flow's own
  // interface waits on that same clock to finish removing closed menus and
  // panels, so a sleep timed somewhere unthrottled, such as the service
  // worker, would outrun the page it is waiting for and see overlays Flow has
  // not finished taking down.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- logging ---------------------------------------------------------
  // Mirrors the old bundle's ACTION_LOG contract exactly, so the side
  // panel's Debug Logs tab keeps working with no changes.
  const send = (msg) => {
    try {
      const p = chrome.runtime.sendMessage(msg);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {
      /* panel closed or SW asleep — logging must never throw */
    }
  };

  const stringify = (args) =>
    args
      .map((a) =>
        typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a)
      )
      .join(' ');

  const log = {
    info: (...a) => send({ type: 'ACTION_LOG', data: { level: 'info', message: stringify(a), timestamp: Date.now() } }),
    warn: (...a) => send({ type: 'ACTION_LOG', data: { level: 'warn', message: stringify(a), timestamp: Date.now() } }),
    error: (...a) => send({ type: 'ACTION_LOG', data: { level: 'error', message: stringify(a), timestamp: Date.now() } }),
  };

  // ---- queries ---------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const textOf = (el) => (el.innerText || el.textContent || '').trim();

  /**
   * Angular Material disables a control three ways at once, and a disabled
   * control swallows a synthetic click in complete silence. That silence is
   * how a paywalled 4K download came back as a success with no file.
   */
  const isDisabled = (el) =>
    !!el &&
    (el.disabled === true ||
      el.getAttribute('aria-disabled') === 'true' ||
      new RegExp(`(^|\\s)${S.disabledMenuItemClass}(\\s|$)`).test(el.className || ''));

  /** Buttons and menu items are addressed by aria-label wherever one exists. */
  const byLabel = (label, root = document) =>
    $$('button, [role="menuitem"], a', root).find(
      (el) => el.getAttribute('aria-label') === label
    ) || null;

  /**
   * Text matching for controls with no aria-label (menu items, ratio and
   * count chips). `exact` guards against "1K" also matching "1K Original
   * size" in the wrong direction, and against "Download" matching a
   * "Download all" entry.
   */
  const byText = (sel, wanted, { root = document, exact = false } = {}) => {
    const candidates = Array.isArray(wanted) ? wanted : [wanted];
    return (
      $$(sel, root).find((el) => {
        const t = textOf(el);
        return candidates.some((w) =>
          exact ? t === w || t.split('\n')[0].trim() === w : t.includes(w)
        );
      }) || null
    );
  };

  /**
   * Match by the LAST line of an element's text.
   *
   * Material controls render their icon ligature as a leading text node, so
   * a mode toggle reads "image\nImage" and an exact match on the first line
   * finds the ligature, not the label.
   */
  const byLastLine = (sel, wanted, root = document) => {
    const candidates = Array.isArray(wanted) ? wanted : [wanted];
    return (
      $$(sel, root).find((el) => {
        const lines = textOf(el).split('\n').map((l) => l.trim()).filter(Boolean);
        return candidates.includes(lines[lines.length - 1] || '');
      }) || null
    );
  };

  const isChecked = (el) =>
    !!el && (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true');

  /** Toggle buttons (the Agent mode chip) report state as aria-pressed. */
  const isPressed = (el) => !!el && el.getAttribute('aria-pressed') === 'true';

  /** Menu items render their icon ligature as leading text; strip it. */
  const menuItemByText = (wanted, root = document) => {
    const candidates = Array.isArray(wanted) ? wanted : [wanted];
    return (
      $$(S.menuItem, root).find((el) => {
        // "download\nDownload" -> the label is the last non-empty line
        const lines = textOf(el).split('\n').map((l) => l.trim()).filter(Boolean);
        const label = lines[lines.length - 1] || '';
        return candidates.some((w) => label === w || label.startsWith(w));
      }) || null
    );
  };

  // ---- waiting ---------------------------------------------------------
  /**
   * Poll until `probe` returns something truthy. Everything in the new UI is
   * async (Angular renders, the agent thinks, the scroller recycles tiles),
   * so nothing is ever assumed present on the next line.
   */
  const waitFor = async (probe, { timeout = 15000, interval = 200, label = 'condition', cancelled } = {}) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (cancelled && cancelled()) throw new FA.CancelledError();
      let value;
      try {
        value = probe();
      } catch (_) {
        value = null;
      }
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
      await sleep(interval);
    }
  };

  const waitGone = (probe, opts = {}) => waitFor(() => !probe(), { label: 'element to disappear', ...opts });

  const hasClass = (el, cls) => (el.getAttribute('class') || '').split(/\s+/).includes(cls);

  // ---- interaction -----------------------------------------------------
  const scrollIntoView = (el) => {
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (_) {}
  };

  /** Default click path — synthetic, verified against Angular Material. */
  const click = (el, what = 'element') => {
    if (!el) throw new Error(`Cannot click missing ${what}`);
    // Fail loudly rather than pretending a disabled control was clicked.
    if (isDisabled(el)) throw new Error(`Cannot click disabled ${what}`);
    scrollIntoView(el);
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.click();
    // A real pointer eventually leaves; the synthetic one above never did, so
    // the Material tooltip it opened stayed up for the rest of the batch —
    // two of them had piled up by the end of one run on 2026-09-16. Material
    // binds mouseleave on the trigger itself, so dispatching there is enough,
    // and neither event bubbles, so clicking a control inside a container
    // that reveals it on hover cannot make that container hide it again.
    if (hasClass(el, 'mat-mdc-tooltip-trigger')) {
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: false }));
      el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    }
    return true;
  };

  const describe = (el) => {
    if (!el) return 'nothing (the point is off screen)';
    const tag = String(el.tagName || 'element').toLowerCase();
    const cls = String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    const label = el.getAttribute('aria-label');
    return `<${tag}${cls ? '.' + cls : ''}>${label ? ` "${label}"` : ''}`;
  };

  /**
   * A point on `el` that a real pointer would reach, or what covers it.
   *
   * click() above dispatches straight to the element, so it does not care
   * what is on top. A trusted click is hit-tested like a real one and lands
   * on whatever IS on top. MEASURED 2026-09-27: with Flow's full-screen
   * add-assets dialog left open, the trusted click meant for Start
   * generation landed on an asset tile inside the dialog, which added a
   * stray image to the prompt and submitted nothing. So the point is checked
   * first — the centre, then four more inside the box in case only part of
   * it is covered.
   */
  const reachablePoint = (el) => {
    const r = el.getBoundingClientRect();
    const points = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]].map(([fx, fy]) => ({
      x: Math.round(r.left + r.width * fx),
      y: Math.round(r.top + r.height * fy),
    }));
    let covering = null;
    for (const p of points) {
      const hit = document.elementFromPoint(p.x, p.y);
      if (hit && (hit === el || el.contains(hit))) return { point: p, covering: null };
      if (!covering) covering = hit;
    }
    return { point: null, covering };
  };

  /**
   * For the one control that rejects untrusted events: Start generation
   * (MEASURED 2026-09-26). Routes through the service worker's CDP bridge,
   * which dispatches a real mouse click at viewport coordinates. The raw
   * getBoundingClientRect() point is right as it is — no zoom maths —
   * confirmed live the same day.
   *
   * Throws with `covered: true`, and clicks nothing, when something else is
   * on top of the control: a click there would hit the thing on top.
   */
  const clickTrusted = async (el, what = 'element') => {
    if (!el) throw new Error(`Cannot click missing ${what}`);
    scrollIntoView(el);
    await sleep(60);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) throw new Error(`${what} has no layout box`);
    const { point, covering } = reachablePoint(el);
    if (!point) {
      const err = new Error(`${what} is covered by ${describe(covering)}, so it was not clicked`);
      err.covered = true;
      throw err;
    }
    const res = await sendAsync({ type: 'CC', x: point.x, y: point.y });
    if (!res || !res.success) throw new Error(`Trusted click on ${what} failed: ${res && res.error}`);
    return true;
  };

  const sendAsync = async (msg) => {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      return { success: false, error: e && e.message ? e.message : String(e) };
    }
  };

  /**
   * Replace the composer's contents.
   *
   * The clear step uses Range + execCommand('delete') rather than a
   * synthetic Ctrl+A. That is not stylistic: the old bundle shipped a bug
   * (CHANGELOG 0.3.22) where synthetic select-all silently failed and each
   * retry appended, producing 4x-duplicated prompts. The Range approach was
   * the fix, and ProseMirror behaves the same way here.
   */
  /**
   * Is the composer empty? Flow shows its placeholder beside the editor, not
   * in it (see selectors.promptEditorHost), so this looks from the host.
   */
  const composerEmpty = () => {
    const editor = $(S.promptEditor);
    if (!editor) return false;
    const host = (typeof editor.closest === 'function' && editor.closest(S.promptEditorHost)) || editor;
    return !!host.querySelector(S.promptPlaceholder);
  };

  const setPromptText = async (text) => {
    const editor = await waitFor(() => $(S.promptEditor), { label: 'prompt editor' });
    editor.focus();
    click(editor, 'prompt editor');
    await sleep(80);

    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete');
    await sleep(60);

    const res = await sendAsync({ type: 'CIT', text });
    if (!res || !res.success) throw new Error(`Could not insert prompt text: ${res && res.error}`);

    // Confirm it actually landed — a silent no-op here is what produced
    // empty submissions in the old build.
    await waitFor(
      () => {
        const now = ($(S.promptEditor)?.innerText || '').trim();
        return now.length > 0 && !composerEmpty();
      },
      { timeout: 5000, label: 'prompt text to register' }
    );
    return true;
  };

  // ---- state probes ----------------------------------------------------
  /**
   * "Is Flow working on it?"
   *
   * Both signals are AGENT-MODE ONLY. Sampled every 500ms across a full
   * direct-mode generation on 2026-09-09, the stop button, the thinking
   * indicator and every [role=progressbar] stayed at zero from submit to
   * result — direct mode has no busy affordance at all. So a false here
   * means "no evidence either way", never "finished", and nothing may treat
   * it as proof that a generation is over.
   */
  const isBusy = () => !!$(S.stopButton) || !!$(S.thinkingIndicator);
  const isIdle = () => !!$(S.generateButton) && !$(S.stopButton);
  const inProject = () => location.pathname.includes(S.projectPathFragment);

  /** True while Flow's chat is on screen — the only place a reply can exist. */
  const hasChat = () => !!$(S.chatScroller) || $$(S.chatBubble).length > 0;

  /**
   * Failed generations that Flow rendered into the grid, newest first.
   *
   * The tile carries no data-media-id, so the media diff steps straight over
   * it and a run with nothing but an error tile looks identical to a run
   * where Flow simply never answered.
   */
  const errorTiles = () =>
    $$(S.tileContainer)
      .map((tile, index) => ({ tile, index, error: tile.querySelector(S.errorTile) }))
      .filter((row) => row.error)
      .map(({ index, error }) => {
        const title = textOf(error.querySelector(S.errorTileTitle) || error);
        const body = textOf(error.querySelector(S.errorTileText) || error)
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !/^[a-z][a-z0-9_]*$/.test(l))
          .join(' ');
        return { index, title, text: body || title };
      });

  // ---- the grid: images and videos --------------------------------------
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  /**
   * A stable key for one piece of media, taken from its URL.
   *
   * Image tiles carry data-media-id. Video tiles carry no id at all — in
   * Flow's source the attribute is bound in exactly one place, the image
   * tile — so a video is known by the serving URL its thumbnail and <video>
   * point at. Those two URLs differ in their size options and both gain an
   * authuser parameter, so the key is the media uuid in the URL where there
   * is one, and otherwise the URL without its query and "=options" suffix.
   */
  const mediaKeyFromUrl = (src) => {
    if (!src || /^(data|blob):/i.test(src)) return null;
    const m = UUID_RE.exec(src);
    if (m) return m[0].toLowerCase();
    try {
      const u = new URL(src, location.href);
      return `${u.origin}${u.pathname.replace(/=[^/]*$/, '')}`;
    } catch (_) {
      return null;
    }
  };

  /** "42%" from a generating tile, or null (queued, or not generating). */
  const pendingPercent = (tile) => {
    const el = tile.querySelector(S.pendingPercentage);
    const m = el ? /(\d{1,3})\s*%/.exec(textOf(el)) : null;
    return m ? Math.min(100, Number(m[1])) : null;
  };

  /**
   * Every tile the grid has rendered, top first, with what it shows now.
   * A pending tile that is only fading out belongs to a finished generation.
   */
  const gridTiles = () =>
    $$(S.tileContainer).map((tile, index) => {
      const keys = [];
      for (const img of $$(S.mediaImage, tile)) {
        const id = img.getAttribute(S.mediaIdAttr);
        if (id && !keys.includes(id)) keys.push(id);
      }
      const video = !!tile.querySelector(S.videoTile);
      if (video) {
        for (const el of $$(S.videoMediaSources, tile)) {
          const key = mediaKeyFromUrl(el.getAttribute('src'));
          if (key && !keys.includes(key)) keys.push(key);
        }
      }
      return {
        tile,
        index,
        keys,
        video,
        pending: $$(S.pendingTile, tile).some((el) => !hasClass(el, 'fading-out')),
        failed: !!tile.querySelector(S.errorTile),
        percent: pendingPercent(tile),
      };
    });

  /** Snapshot of every rendered output key — the basis for diffing runs. */
  const mediaIds = () => new Set(gridTiles().flatMap((t) => t.keys));

  const tileForMediaId = (id) => {
    const hit = gridTiles().find((t) => t.keys.includes(id));
    return hit ? hit.tile : null;
  };

  // ---- reference images ------------------------------------------------

  /**
   * Reference-image chips in the prompt box that holds the composer, in order.
   *
   * Scoped to that box, not the document: only a chip inside the box this
   * prompt is typed into will be sent with it.
   *
   * The composer is looked up afresh on every call, never passed in. Flow
   * renders the editor in one of two template slots, chosen by whether the
   * prompt holds any ingredients, so the first chip arriving or the last one
   * leaving destroys the editor and builds a new one. An element held across
   * that is detached, and a dead ProseMirror answers nothing.
   */
  const ingredientChips = () => {
    const editor = $(S.promptEditor);
    const box = (editor && typeof editor.closest === 'function' && editor.closest(S.promptBoxDirect)) || document;
    return $$(S.ingredientChipButton, box).map((el) => ({
      el,
      busy: el.getAttribute('aria-busy') === 'true',
      disabled: hasClass(el, S.ingredientChipDisabledClass),
    }));
  };

  /**
   * Empty the prompt box of reference images.
   *
   * Clicking a chip removes it, but NOT through click() above. That helper
   * dispatches mouseenter first, and on these chips mouseenter opens an image
   * preview overlay that nothing afterwards closes. Flow also treats any
   * touch-capable device ("(pointer: coarse)" or navigator.maxTouchPoints > 0,
   * which covers plenty of Windows laptops) as a phone: there the first click
   * only arms the chip and the second removes it. So click, watch the count,
   * and click again while it has not dropped.
   */
  const clearIngredientChips = async ({ cancelled } = {}) => {
    const start = ingredientChips().length;
    let clicks = 0;
    for (;;) {
      const chips = ingredientChips();
      if (!chips.length || clicks >= start * 3) break;
      chips[0].el.click();
      clicks++;
      await waitFor(() => ingredientChips().length < chips.length, {
        timeout: 1200,
        interval: 100,
        label: 'a reference image to be removed',
        cancelled,
      }).catch((e) => {
        if (e && e.cancelled) throw e;
      });
    }
    const remaining = ingredientChips().length;
    return { removed: start - remaining, remaining };
  };

  /**
   * Flow's snackbars, oldest first. Upload failures are reported here and
   * nowhere else.
   *
   * The label starts with an icon ligature ("error") in a mat-icon. That
   * icon is inline, so innerText runs it straight into the message with no
   * line break between them, and a line-based filter alone would report
   * "error Failed to upload ...". The icon's own text is cut off the front
   * first.
   */
  const snackbars = () =>
    $$(S.snackbar).map((el) => {
      const label = el.querySelector(S.snackbarLabel) || el;
      const icon = label.querySelector('mat-icon');
      const ligature = icon ? textOf(icon) : '';
      let text = textOf(label);
      if (ligature && text.startsWith(ligature)) text = text.slice(ligature.length);
      return {
        el,
        text: text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !/^[a-z][a-z0-9_]*$/.test(l))
          .join(' '),
      };
    });

  /**
   * Hand Files to the composer the way pasting them would.
   *
   * Flow's editor keeps every clipboard item whose type starts with
   * "image/", and calls preventDefault() once it has taken them. That makes
   * defaultPrevented the one immediate signal that Flow accepted the paste:
   * the chips and the upload happen asynchronously after this returns.
   *
   * The event is synthetic, so it has no user activation: it cannot open a
   * file chooser or read the real clipboard, and Flow's handler never looks
   * at isTrusted.
   */
  const pasteFiles = (target, files) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    const notPrevented = target.dispatchEvent(ev);
    return !notPrevented || ev.defaultPrevented === true;
  };

  /**
   * Close any open cdk overlay without clicking anything inside it.
   *
   * MEASURED on the live app 2026-09-08: dispatching Escape does NOT close a
   * mat-menu — two panels stayed open through both dispatches. Clicking the
   * backdrop closes them immediately. Since every download leaves a menu and
   * its full-viewport backdrop behind, a no-op dismiss would sit on top of
   * the page and swallow the next prompt's clicks.
   *
   * Escape is kept as the fallback for overlays that have no backdrop — and
   * that fallback has to be reachable. MEASURED 2026-09-09: the prompt box's
   * Settings panel is a .cdk-overlay-pane with no backdrop and no menu
   * panel, so an "is anything open?" test that named only those two returned
   * "nothing to do" and left the panel up, its eleven toggles still in the
   * document for the next prompt's matchers to find. The open check counts
   * panes as well; Escape closes that one on the first attempt.
   */
  /**
   * Is this pane something a later step could trip over?
   *
   * MEASURED on the live app 2026-09-16: every synthetic click on a
   * `mat-mdc-tooltip-trigger` left a Material tooltip up — each one its own
   * `.cdk-overlay-pane` — because a synthetic pointer enters and never
   * leaves. A bare pane count was therefore permanently true, so
   * dismissOverlays() never returned early, never found a backdrop, and fired
   * its Escape volley after every single step. That volley is what did the
   * damage: see openByTrigger in step-machine.js. A tooltip covers nothing
   * and leaves when the pointer does, so it does not count; neither do the
   * empty panes CDK keeps around while a detach animation finishes.
   *
   * Nor does a snackbar (MEASURED 2026-09-27). Every download raises one for
   * 7 s and more, Escape does not close it, and counting it made every
   * download end in "An overlay would not close" plus an Escape volley.
   */
  const isBlockingPane = (pane) =>
    !hasClass(pane, 'mat-mdc-tooltip-panel') &&
    !pane.querySelector('mat-tooltip-component, .mat-mdc-tooltip') &&
    !pane.querySelector(S.snackbarContainer) &&
    (pane.children ? pane.children.length : 0) > 0;

  const blockingPanes = () => $$(S.overlayPane).filter(isBlockingPane);

  const anyOverlayOpen = () => !!($(S.menuPanel) || $(S.overlayBackdrop) || blockingPanes().length);

  const dismissOverlays = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!anyOverlayOpen()) return true;
      const backdrop = $(S.overlayBackdrop);
      // Flow's narrow-viewport add menu is a full-screen dialog with no
      // backdrop; its own Close button is the sure way out of it.
      const mobileMenu = $(S.addMenuMobile);
      const mobileClose = mobileMenu && $(S.addMenuMobileClose, mobileMenu);
      if (mobileClose) {
        mobileClose.click();
      } else if (backdrop) {
        backdrop.click();
      } else {
        for (const target of [document.body, document]) {
          for (const type of ['keydown', 'keyup']) {
            target.dispatchEvent(
              new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true })
            );
          }
        }
      }
      await sleep(250);
    }
    if (anyOverlayOpen()) {
      log.warn('An overlay would not close — the next step may be reading controls that belong to it');
      return false;
    }
    return true;
  };

  class CancelledError extends Error {
    constructor() {
      super('Cancelled');
      this.name = 'CancelledError';
      this.cancelled = true;
    }
  }

  FA.CancelledError = CancelledError;
  FA.driver = {
    sleep, log, send, sendAsync,
    $, $$, textOf, isDisabled, isChecked, isPressed, byLabel, byText, byLastLine, menuItemByText,
    hasClass, isBlockingPane, blockingPanes,
    waitFor, waitGone,
    click, clickTrusted, reachablePoint, scrollIntoView, setPromptText, composerEmpty,
    isBusy, isIdle, inProject, hasChat, mediaIds, errorTiles, tileForMediaId,
    gridTiles, mediaKeyFromUrl,
    ingredientChips, clearIngredientChips, snackbars, pasteFiles,
    dismissOverlays, anyOverlayOpen,
  };
})();
