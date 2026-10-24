/**
 * Flow Automata — selector map for Flow's Angular UI (2026-09).
 *
 * Replaces assets/remoteConfig-D92R-AaI.js, whose jQuery-flavoured map
 * (`button:has(i:contains("add_2"))`, `div[data-tile-id]`, `[data-state=open]`)
 * matches nothing since Google rebuilt Flow in Angular Material. Measurements
 * and the reasoning behind each hook are in docs/flow-ui-2026-09.md.
 *
 * Two rules learned from the old map's decay:
 *
 *   1. Anchor on `aria-label` and Angular component tag names, never on icon
 *      ligature text. Google renamed `add_2` -> `add` and moved icons from
 *      `<i>` to `<mat-icon>` in one release; the labels survived.
 *   2. Never address a menu item by index. Flow's tile menu contains a
 *      "Move to trash" entry, so an off-by-one deletes the user's work.
 *
 * VERIFIED  — observed on the live DOM on 2026-09-07.
 * INFERRED  — same component family, not yet exercised.
 * SOURCE    — read from Flow's own production JavaScript (the public
 *             boq-labs-ai-sandbox AiSandboxAngularFrontend bundle on
 *             gstatic, fetched 2026-09-14), not yet seen on the live DOM.
 */
(function () {
  'use strict';

  const FA = (globalThis.FA = globalThis.FA || {});

  FA.selectors = {
    // ---- shell / routing ------------------------------------------------
    // VERIFIED. Project URLs are still /project/<uuid>, so the old
    // `href.includes('/project/')` test survives the rewrite untouched.
    projectPathFragment: '/project/',
    appRoot: 'aisandbox-root',
    projectPage: 'flow-project-page',

    // VERIFIED. Home screen, "+ New project" floating action button.
    createProjectButton: 'button.new-project-button',
    projectCard: 'flow-project-card',

    // ---- agent panel / composer ----------------------------------------
    // VERIFIED. The whole right-hand panel; absent when the user closed it.
    agentPanel: 'flow-agent-panel',
    chatView: 'flow-chat-view',
    chatScroller: 'flow-chat-scroller',
    chatBubble: 'flow-chat-bubble',

    // VERIFIED. ProseMirror rich-text editor, not a textarea and not
    // `div[role=textbox]`. "Is it empty" means "does the placeholder exist" —
    // but MEASURED 2026-09-27, the placeholder is NOT inside the editor: it is
    // a sibling span that flow-rich-text-editor renders only while the editor
    // is empty (<span class=prosemirror-placeholder> then
    // div.prosemirror-editor > .ProseMirror). Looked up inside .ProseMirror it
    // never matched, which is why every direct-mode submit logged "no submit
    // signal". Always look it up from the host.
    promptEditor: 'flow-rich-text-editor .ProseMirror',
    promptEditorHost: 'flow-rich-text-editor',
    promptPlaceholder: '.prosemirror-placeholder',

    // VERIFIED. These two never coexist — the swap is the busy/idle signal,
    // which is far more reliable than the old timing heuristics.
    generateButton: 'flow-generate-icon-button button',
    stopButton: 'flow-stop-icon-button button',
    thinkingIndicator: 'flow-chat-thinking-indicator',

    // VERIFIED. aria-labels on the composer row.
    addIngredientsLabel: 'Add ingredients to the prompt box',
    agentInstructionsLabel: 'Agent instructions',
    settingsLabel: 'Settings',
    startGenerationLabel: 'Start generation',
    newSessionLabel: 'Start new session',

    // ---- the prompt box and its Agent chip (RE-MEASURED 2026-09-09) -----
    // Correction to the 2026-09-08 reading. There are not two prompt boxes
    // to choose between: flow-base-prompt-box is NESTED INSIDE
    // flow-creative-agent-prompt-box, which is inside flow-agent-panel, and
    // there is exactly ONE ProseMirror composer and ONE Start generation
    // button on a project page. Measured ancestry:
    //
    //   flow-rich-text-editor < flow-base-prompt-box
    //     < flow-creative-agent-prompt-box < flow-agent-panel
    //     < flow-project-sidenav-container < flow-project-page
    //
    // What actually decides the behaviour is a toggle chip in the box:
    //
    //   button.agent-mode-chip[aria-pressed="true"]   AGENT mode (default).
    //     The prompt goes to the chat agent, which INTERVIEWS narrative
    //     prompts instead of drawing them, and — with "Confirm before
    //     generating" set to Always, as it is on this account — asks before
    //     it spends anything. The Settings trigger offers aspect ratio only.
    //   button.agent-mode-chip[aria-pressed="false"]  DIRECT mode.
    //     Deterministic: the prompt generates straight into the media grid
    //     with no chat turn at all, and the Settings trigger carries
    //     Image/Video, five aspect ratios, the model family and x1-x4,
    //     plus a "Generating will use N credits" line.
    //
    // Batches must run in DIRECT mode. That is the single control that makes
    // a run deterministic, and pressing it is what the engine was missing.
    promptBoxDirect: 'flow-base-prompt-box',
    promptBoxAgent: 'flow-creative-agent-prompt-box',
    agentModeChip: 'button.agent-mode-chip',
    settingsTriggerLabel: 'Settings trigger',
    // Every option in that panel is a Material button-toggle radio whose
    // visible label is the LAST line of its text (a mat-icon ligature comes
    // first, e.g. "image" then "Image").
    toggleOption: 'button.mat-button-toggle-button[role="radio"]',
    modeOptionText: { image: 'Image', video: 'Video' },

    // VERIFIED on the live page 2026-09-15 (read from source 2026-09-14). The
    // Settings trigger's panel is flow-prompt-box-settings, and each control
    // in it is a flow-toggles group with its own aria-label, in this order:
    // Mode, Video type (video only), Aspect ratio, the model picker, Video
    // resolution and Video duration (each only when the model offers a
    // choice), Output count. A pick is scoped to its group so "x1" or "8s" can
    // never land in another one.
    //
    // Measured per model: Omni 1.1 Flash offers Video resolution (360p, 720p)
    // and Video duration (4s 6s 8s 10s); the three Veo 3.1 models offer
    // neither. The engine never sets the resolution, so Flow keeps its own
    // choice. (An earlier reading had the 360p toggle carrying an "info" icon
    // after its label, making its last line "info"; re-read live 2026-09-16 it
    // is plain "360p". Moot either way — the engine never picks a resolution.)
    promptBoxSettings: 'flow-prompt-box-settings',
    toggleGroup: (label) => `flow-toggles[aria-label="${label}"]`,
    settingsGroups: {
      mode: 'Mode',
      videoType: 'Video type',
      ratio: 'Aspect ratio',
      duration: 'Video duration',
      count: 'Output count',
    },
    // VIDEO_FRAMES and VIDEO_REFERENCES. Switching to Frames turns the first
    // image reference into the start frame and the second into the end frame
    // (Flow's own mode switch does it), which is how start frames get set.
    videoTypeText: { frames: 'Frames', ingredients: 'Ingredients' },
    // The side panel's ratio values, as Flow labels them. "square", "portrait"
    // and "landscape" were Material icon names in the old build (crop_square,
    // crop_portrait, crop_landscape); Flow's toggles read 1:1, 3:4 and 4:3.
    // Video models offer 16:9 and 9:16 only.
    ratioLabels: {
      '16:9': '16:9',
      '9:16': '9:16',
      '1:1': '1:1',
      square: '1:1',
      '3:4': '3:4',
      portrait: '3:4',
      '4:3': '4:3',
      landscape: '4:3',
    },
    // VERIFIED 2026-09-15. The model families are named by the SERVER, not by
    // Flow's code, so the side panel's names can only be matched against the
    // menu's labels at run time (see matchModel in step-machine.js). On the
    // test account the menu read "🍌 Nano Banana Pro", "🍌 Nano Banana 2",
    // "🍌 Nano Banana 2 Lite" for images and "Omni 1.1 Flash",
    // "Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality" for video; no
    // "[Lower Priority]" entries and no Imagen 4. Other plans may differ.
    modelPickerLabel: 'Select model family',
    modelMenuPanel: '.flow-model-picker-panel',
    menuItemLabel: '.label',

    // A reply that asks rather than draws. Retrying identical text against
    // this produces another question, so it must not be retried.
    //
    // ONLY ever test this against the text of a real flow-chat-bubble. The
    // chat's empty state reads "Hi <name> / What would you like to create?"
    // and this regex matches it, so any matcher that falls back to the chat
    // scroller — or worse, to document.body — reports a clarifying question
    // for a prompt Flow is quietly generating. That is what killed every run
    // on 2026-09-08: a fatal, non-retryable failure at ~16s against a
    // generation that takes 50-70s.
    agentQuestionSignature: /\?\s*$|what (kind|sort|tone|style)|would you like|do you want|to help (us|me)|a few questions|which of these/i,

    // ---- agent settings panel -------------------------------------------
    // VERIFIED. Opened by the Settings (tune) button. Unlike the old
    // per-prompt popover, this panel PERSISTS via its Save button, so it is
    // applied once per batch and only when the caller opts in.
    settingsSaveText: 'Save',
    settingsImageSectionText: 'Image generation default',
    settingsVideoSectionText: 'Video generation default',
    settingsConfirmSectionText: 'Confirm before generating',
    // Ratio / count buttons carry their label as text: "16:9", "x2".
    ratioButtonText: (ratio) => ratio,
    countButtonText: (n) => `x${n}`,
    modelDropdown: 'button[aria-haspopup="listbox"], mat-select',

    // ---- media grid ------------------------------------------------------
    // VERIFIED. Tiles live in a cdk virtual scroller, so offscreen tiles are
    // NOT in the DOM. New output always lands at index 0.
    tileContainer: 'flow-tile-container',
    imageTile: 'flow-image-tile',
    virtualScroller: 'cdk-virtual-scroll-viewport',

    // VERIFIED. THE replacement for the old `data-tile-id`. Sits on the
    // <img>, holds a uuid, and is the only stable per-output identity —
    // captions are rewritten by the agent and cannot be matched to prompts.
    mediaIdAttr: 'data-media-id',
    mediaImage: 'img[data-media-id]',

    // VERIFIED 2026-09-09. A failed generation does NOT announce itself in
    // the chat — in direct mode there is no chat. It lands in the grid as a
    // tile of its own, at index 0, carrying no data-media-id:
    //
    //   Failed
    //   You've reached your usage limit. Please try again later.
    //   You have not been charged for this generation.
    //   [Retry] [Reuse prompt] [Delete]
    //
    // Until this was mapped the engine could only wait out its timeout and
    // then report something it had inferred rather than read.
    errorTile: 'flow-error-tile',
    errorTileTitle: '.error-title',
    errorTileText: '.error-message-text, .error-subtitle',
    // Flow's own words for "come back later". Retrying inside a batch cannot
    // clear this, so it aborts the batch instead of burning the queue.
    quotaSignature: /usage limit|rate limit|quota|too many|try again later/i,

    // MEASURED 2026-09-10, live: after eight rapid retries of a prompt Flow
    // kept refusing, the error tile changed from "Sorry, this image failed to
    // generate." to:
    //
    //   We noticed some unusual activity. Please visit the Help Center for
    //   more information.
    //
    // That is anti-automation detection, and it is the one refusal where
    // trying again is actively harmful: each retry is further evidence of
    // exactly the behaviour being flagged. It has to stop the batch harder
    // than a quota refusal does, and say so in the user's own terms —
    // quotaSignature does not match any of this wording.
    blockedSignature: /unusual activity|suspicious activity|help c[ae]nt(er|re)|temporarily (blocked|suspended|disabled)|violat\w* (our|the) (policy|policies|terms)/i,

    // VERIFIED. Tile hover hotbar; the buttons exist in the DOM without
    // hovering, so they can be clicked directly.
    tileMoreOptionsLabel: 'More options',
    tileFavoriteLabel: 'Favorite',
    tileReusePromptLabel: 'Reuse prompt',

    // ---- tile menu + download -------------------------------------------
    // VERIFIED. Menu items are matched by TEXT, never by position.
    menuItem: '[role="menuitem"]',
    menuPanel: '.mat-mdc-menu-panel',
    overlayContainer: '.cdk-overlay-container',
    // VERIFIED 2026-09-08 on the live app: clicking this is the ONLY thing
    // that closes a mat-menu. Dispatching Escape leaves it open.
    overlayBackdrop: '.cdk-overlay-backdrop',
    // MEASURED 2026-09-09: the prompt box's Settings panel is a cdk overlay
    // with NO backdrop and no .mat-mdc-menu-panel, so a dismiss keyed to
    // those two saw nothing to close and left it sitting over the page with
    // its toggles still in the document — where the next prompt's
    // document-wide matchers could find them. Escape DOES close this one.
    overlayPane: '.cdk-overlay-pane',
    // Angular Material marks an unavailable item three ways at once.
    disabledMenuItemClass: 'mat-mdc-menu-item-disabled',
    downloadItemText: 'Download',
    trashItemText: 'Move to trash', // never click; listed so it can be avoided

    // VERIFIED 2026-09-08 against the live submenu, which reads
    // "1K / Original size", "2K / Upscaled", "4K / Upscaled".
    //
    // The paywalled tier is NOT marked with the word "Upgrade" — that button
    // lives elsewhere on the page. 4K is simply `disabled` (property, plus
    // the mat-mdc-menu-item-disabled class). Matching on "Upgrade" alone
    // meant clicking a dead item and reporting a download that never
    // happened, so the disabled state is the real signal.
    // Panel value -> submenu label, for IMAGES. These are different
    // vocabularies and conflating them is silent: the side panel offers
    // 1k/2k/4k for images and 720/1080/4k for videos, while Flow's image
    // submenu reads "1K Original size", "2K Upscaled", "4K Upscaled". The
    // video sizes have a map of their own (videoQualityLabels, below).
    qualityLabels: {
      '4k': '4K',
      '2k': '2K',
      '1k': '1K',
    },
    // Highest to lowest, as observed in the download submenu.
    qualityLadder: ['4K', '2K', '1K'],
    upgradeButtonText: 'Upgrade',

    // ---- media hosts -----------------------------------------------------
    // VERIFIED. Fresh output serves from flow-content.google, older media
    // from flow.google.com/asb/<id>. Both contain "google", so the service
    // worker's existing download filter still matches.
    mediaHosts: ['flow-content.google', 'flow.google.com'],

    // ---- reference images (image-to-image) -----------------------------
    // SOURCE. "Add ingredients" is a media picker with no file input in it,
    // which is why the engine could never attach anything. Its "Upload
    // media" entry builds a hidden <input type=file> on demand and clicks
    // it. The composer offers a simpler route:
    //
    //   flow-rich-text-editor's ProseMirror `handlePaste` collects every
    //   clipboard item whose type starts with "image/", calls getAsFile(),
    //   and emits them as `pasteImages`. flow-base-prompt-box then uploads
    //   each one ("upload_image", source PROMPT_BOX_PASTE) and adds it to
    //   the prompt as a REFERENCE ingredient: first as a loading chip, then
    //   as the finished one.
    //
    // So a synthetic paste event carrying Files does the whole job. It never
    // opens a file chooser and never goes near a menu.
    //
    // Each chip is
    //   flow-ingredient-bar > flow-ingredient-chip
    //     > flow-image-ingredient-chip > button.chip-container
    // with aria-busy="true" while it uploads and chip-container-disabled
    // when the chosen model cannot use it ("IMAGE_REFERENCES_EXCEEDED" and
    // similar). The bar is only rendered while the prompt holds at least
    // one ingredient. CLICKING A CHIP REMOVES IT. On a touch-capable device
    // the first click only arms it and the second removes it.
    ingredientBar: 'flow-ingredient-bar',
    ingredientChipButton: 'flow-ingredient-bar button.chip-container',
    ingredientChipDisabledClass: 'chip-container-disabled',
    // Flow accepts a file by its EXTENSION, not its MIME type, and decodes it
    // only if the MIME type starts with "image/". Both have to be right.
    referenceImageExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heif', 'heic'],
    referenceImageMaxBytes: 20 * 1024 * 1024,
    referenceImageMaxNameLength: 256,

    // SOURCE. The first image upload on an account opens "Rights to use this
    // image" (Cancel / I agree). Agreeing is recorded server-side, so it is
    // asked once. It is a statement the user makes about their own rights to
    // the image, so the engine waits for the user to answer it and never
    // clicks either button. Cancel makes Flow drop the images silently.
    uploadConsentDialog: 'flow-upload-consent-dialog',
    consentWaitMs: 5 * 60 * 1000,

    // SOURCE. Upload failures are snackbars, not tiles: flow-snackbar gets
    // the class "error" and the message sits in .label. Flow's wording:
    // "Failed to upload <name>", "Unsupported file type: <name> (...)",
    // "File too large: <name> (Max size is 20 MB)".
    snackbar: 'flow-snackbar',
    snackbarLabel: '.label',
    // MEASURED 2026-09-27: every download raises one ("Downloading your
    // image…", then "Your image has been downloaded! Dismiss") in a
    // .cdk-overlay-pane of its own, for 7 s and more. It blocks nothing and
    // Escape does not close it, so it must never count as an open overlay.
    snackbarContainer: 'mat-snack-bar-container, .mat-mdc-snack-bar-container',
    uploadErrorSignature: /failed to upload|unsupported file type|file too large/i,

    // ---- video tiles (SOURCE 2026-09-14) --------------------------------
    // Only image tiles carry data-media-id; that is the single place in
    // Flow's code the attribute is bound. A finished flow-video-tile has a
    // thumbnail <img class="thumbnail"> and a <video aria-label="Generated
    // video">, both pointing at the video's serving URL, and nothing else to
    // identify it by. While it generates it holds a flow-pending-tile whose
    // .loading-percentage reads "42%", or "Queued".
    videoTile: 'flow-video-tile',
    videoMediaSources: 'video[src], img.thumbnail[src]',
    pendingTile: 'flow-pending-tile',
    pendingPercentage: '.loading-percentage',
    // SOURCE. A video's Download submenu: "270p / Animated GIF", its original
    // size ("720p" or "360p" / "Original size"), then "720p", "1080p" and
    // "4K" / "Upscaled" where the plan allows. Upscaled sizes may cost
    // credits. The GIF is never a fallback. When Flow offers a single size
    // there is no submenu: the Download item downloads it directly.
    videoQualityLabels: { '4k': '4K', '1080': '1080p', '720': '720p' },
    videoQualityLadder: ['4K', '1080p', '720p', '360p'],
    downloadSizeLabel: /^(\d{3,4}p|\d+K)$/i,

    // ---- start and end frames (SOURCE) ----------------------------------
    // In Frames mode the ingredient bar holds two .frame-trigger slots with a
    // swap button between them. A set frame is an image chip in its slot; an
    // empty slot is button.empty-chip reading "Start" or "End", which opens a
    // picker and is never clicked.
    frameChip: 'flow-ingredient-bar .frame-trigger button.chip-container',

    // ---- voices, through the add-ingredients menu (SOURCE) --------------
    // The popover is flow-add-menu-popover-content: category tabs
    // (role=tab, titled "Voices" etc.), a search box, and an asset list of
    // button.asset-item options. One click selects an asset; a second click
    // on the selected asset adds it to the prompt. Each voice row also has a
    // "Delete voice" button, and the side nav an "Upload media" button that
    // opens the OS file chooser: neither is ever clicked.
    addMenuPopover: 'flow-add-menu-popover-content',
    addMenuCategoryTab: '[role="tab"]',
    // The tab's own title element. Its icon is inline, and innerText can run
    // an inline icon's ligature into the text next to it (measured on Flow's
    // snackbars), so the title is read on its own rather than as a last line.
    addMenuCategoryTitle: '.side-nav-list-item-title',
    voicesCategoryText: 'Voices',
    addMenuSearch: 'input.search-input',
    addMenuAssetItem: 'button.asset-item',
    addMenuAssetTitle: '.asset-title',
    // NOT PRESENT on the live page 2026-09-15: the popover has no close
    // button at all, only a cdk-overlay-dark-backdrop. attachVoice then falls
    // back to dismissOverlays, and a click on that backdrop was verified to
    // close the menu. Kept in case a later build adds one. The tabs, the
    // search box and all 24 of the side panel's voice names were verified the
    // same day; a search narrows the list to the one voice.
    addMenuCloseButton: 'button.header-close-btn',
    // MEASURED 2026-09-27: in a narrow viewport — which is what Flow gets
    // whenever the side panel is open beside it (733 and 1100 CSS px were
    // both narrow) — the same button opens a DIFFERENT menu:
    // flow-mobile-add-menu, a full-screen role=dialog "Add assets to the
    // project". No category tabs: a "Filter by category" dropdown
    // (button.filter-trigger) lists button.filter-option[role=option]s
    // (All, Images, Videos, Voices, Characters, Avatars, Uploads), each an
    // icon ligature plus its label. The search box and button.asset-item /
    // .asset-title are the same as the popover's. ONE click on a voice adds
    // it and closes the dialog. Its header has a Close button.
    //
    // Missing this variant cost more than the voice. Waiting for the popover,
    // the engine re-clicked the trigger, left the dialog up, and the trusted
    // click on Start generation then landed on an asset tile inside it: the
    // prompt gained a stray image ingredient and was never submitted.
    addMenuMobile: 'flow-mobile-add-menu',
    addMenuFilterTrigger: 'button.filter-trigger',
    addMenuFilterOption: 'button.filter-option',
    addMenuMobileClose: 'button.close-button',

    // ---- not used by the engine -----------------------------------------
    // VERIFIED tile menu entries (2026-09-07), kept for reference. "Add to
    // prompt" is how chaining ("concat") would attach a previous result, if
    // that is ever built.
    animateItemText: 'Animate',
    addToPromptItemText: 'Add to prompt',
  };

  /**
   * Flow ships several locales. Where a hook is text-based we match the
   * English string first and fall back to the aria-label, which has been
   * more stable across releases than visible copy.
   */
  FA.selectors.textFallbacks = {
    Download: ['Download', 'Descargar', 'Télécharger', 'ダウンロード'],
    Save: ['Save', 'Guardar', 'Enregistrer', '保存'],
  };
})();
