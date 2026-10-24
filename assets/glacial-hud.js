/**
 * Connect Flow — In-Page Glacial HUD & Anti-Throttling Keep-Awake Engine
 * Integrates:
 *   - WebRTC & Silent Audio keep-awake to eliminate background throttling
 *   - Live Agent Bridge connection monitor (port 8791)
 *   - Smart Variables & combinatorial prompt expansion
 *   - Direct Mode enforcement for deterministic generation
 *   - Glacial HUD UI (Pale Glacier Blue & Cyber Flow Loop)
 */

(function () {
  'use strict';

  if (window.__connect_flow_hud_injected) return;
  window.__connect_flow_hud_injected = true;

  // ---- 1. Keep-Awake System (WebRTC Loop + AudioContext) ----
  let keepAwakePeers = null;
  let keepAwakeAudio = null;
  let keepAwakeActive = false;

  function enableKeepAwake() {
    keepAwakeActive = true;
    try {
      if (!keepAwakeAudio) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          keepAwakeAudio = new AudioCtx();
          const osc = keepAwakeAudio.createOscillator();
          const gain = keepAwakeAudio.createGain();
          gain.gain.value = 0.00005; // essentially silent
          osc.connect(gain);
          gain.connect(keepAwakeAudio.destination);
          osc.start();
        }
      }
      if (keepAwakeAudio && keepAwakeAudio.state === 'suspended') {
        keepAwakeAudio.resume();
      }
    } catch (_) {}

    try {
      if (!keepAwakePeers && typeof RTCPeerConnection === 'function') {
        const pc1 = new RTCPeerConnection();
        const pc2 = new RTCPeerConnection();
        pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {});
        pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {});
        pc1.createDataChannel('connect-flow-awake');
        pc1.createOffer().then(offer => pc1.setLocalDescription(offer))
          .then(() => pc2.setRemoteDescription(pc1.localDescription))
          .then(() => pc2.createAnswer())
          .then(answer => pc2.setLocalDescription(answer))
          .then(() => pc1.setRemoteDescription(pc2.localDescription))
          .catch(() => {});
        keepAwakePeers = [pc1, pc2];
      }
    } catch (_) {}
  }

  function disableKeepAwake() {
    keepAwakeActive = false;
    if (keepAwakeAudio) {
      try { keepAwakeAudio.suspend(); } catch (_) {}
    }
    if (keepAwakePeers) {
      keepAwakePeers.forEach(pc => { try { pc.close(); } catch (_) {} });
      keepAwakePeers = null;
    }
  }

  // Auto-enable keep-awake to guarantee full generation speed
  enableKeepAwake();

  // ---- 2. Direct Mode Helper ----
  function enforceDirectMode() {
    const chip = document.querySelector('button.agent-mode-chip[aria-pressed="true"]');
    if (chip) {
      chip.click();
      return true;
    }
    return false;
  }

  // Auto-ensure Direct Mode every 5 seconds
  setInterval(() => {
    try { enforceDirectMode(); } catch (_) {}
  }, 5000);

  // ---- 3. Smart Variables & Combinatorial Math ----
  function extractVariables(text) {
    const matches = new Set();
    const regex = /\[([a-zA-Z0-9_-]+)\]|\{([a-zA-Z0-9_-]+)\}/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      matches.add((m[1] || m[2]).toLowerCase());
    }
    return Array.from(matches);
  }

  function cartesianProduct(arrays) {
    if (arrays.length === 0) return [[]];
    return arrays.reduce((acc, curr) => {
      const res = [];
      for (const a of acc) {
        for (const c of curr) {
          res.push([...a, c]);
        }
      }
      return res;
    }, [[]]);
  }

  function expandPrompts(prompts, variables) {
    const results = [];
    prompts.forEach(p => {
      const needed = extractVariables(p).filter(v => variables[v] && variables[v].length > 0);
      if (needed.length === 0) {
        results.push(p);
        return;
      }
      const values = needed.map(v => variables[v]);
      const combos = cartesianProduct(values);
      combos.forEach(combo => {
        let text = p;
        needed.forEach((v, idx) => {
          text = text.replace(new RegExp(`\\[${v}\\]|\\{${v}\\}`, 'gi'), combo[idx]);
        });
        results.push(text);
      });
    });
    return results;
  }

  // ---- 4. Glacial CSS Styles ----
  const style = document.createElement('style');
  style.id = 'connect-flow-hud-styles';
  style.textContent = `
    #cf-floating-hud {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      background: rgba(9, 14, 23, 0.88);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 229, 255, 0.25);
      border-radius: 20px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 229, 255, 0.15);
      z-index: 2147483647;
      color: #e0f2fe;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      overflow: hidden;
    }
    #cf-floating-hud.minimized {
      width: 160px;
      height: 48px;
      border-radius: 24px;
      cursor: pointer;
    }
    #cf-floating-hud.minimized .cf-body,
    #cf-floating-hud.minimized .cf-tabs {
      display: none !important;
    }
    .cf-header {
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 229, 255, 0.15);
      background: rgba(0, 229, 255, 0.03);
    }
    .cf-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.5px;
      color: #7dd3fc;
    }
    .cf-brand-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00e5ff;
      box-shadow: 0 0 8px #00e5ff;
    }
    .cf-header-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .cf-icon-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: all 0.2s;
    }
    .cf-icon-btn:hover {
      color: #00e5ff;
      background: rgba(0, 229, 255, 0.1);
    }
    .cf-tabs {
      display: flex;
      border-bottom: 1px solid rgba(0, 229, 255, 0.1);
      background: rgba(0, 0, 0, 0.2);
    }
    .cf-tab {
      flex: 1;
      text-align: center;
      padding: 8px 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .cf-tab.active {
      color: #00e5ff;
      border-bottom-color: #00e5ff;
      background: rgba(0, 229, 255, 0.05);
    }
    .cf-body {
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cf-body::-webkit-scrollbar { width: 4px; }
    .cf-body::-webkit-scrollbar-thumb { background: rgba(0, 229, 255, 0.2); border-radius: 4px; }
    .cf-status-box {
      background: rgba(0, 229, 255, 0.05);
      border: 1px solid rgba(0, 229, 255, 0.15);
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cf-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cf-pill {
      font-size: 9px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .cf-pill-green { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .cf-pill-cyan { background: rgba(0, 229, 255, 0.2); color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.3); }
    .cf-pill-gray { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
    .cf-textarea {
      width: 100%;
      min-height: 80px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 10px;
      padding: 10px;
      color: #fff;
      font-size: 11px;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
    }
    .cf-textarea:focus {
      border-color: #00e5ff;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
    }
    .cf-btn-primary {
      background: linear-gradient(135deg, #00e5ff 0%, #0284c7 100%);
      color: #041019;
      font-weight: 700;
      font-size: 11px;
      border: none;
      padding: 10px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(0, 229, 255, 0.3);
    }
    .cf-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0, 229, 255, 0.5);
    }
    .cf-chip {
      background: rgba(0, 229, 255, 0.1);
      border: 1px solid rgba(0, 229, 255, 0.2);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #7dd3fc;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 2px;
    }
  `;
  document.head.appendChild(style);

  // ---- 5. Glacial HUD HTML Shell ----
  const hud = document.createElement('div');
  hud.id = 'cf-floating-hud';
  hud.innerHTML = `
    <div class="cf-header" id="cf-drag-handle">
      <div class="cf-brand">
        <div class="cf-brand-dot"></div>
        <span>CONNECT FLOW</span>
      </div>
      <div class="cf-header-actions">
        <button class="cf-icon-btn" id="cf-keep-awake-btn" title="Toggle Keep-Awake Protection">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </button>
        <button class="cf-icon-btn" id="cf-min-btn" title="Minimize / Expand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"/></svg>
        </button>
      </div>
    </div>

    <div class="cf-tabs">
      <div class="cf-tab active" data-tab="bridge">Agent Bridge</div>
      <div class="cf-tab" data-tab="batch">Bulk Batch</div>
      <div class="cf-tab" data-tab="vars">Smart Vars</div>
      <div class="cf-tab" data-tab="downloads">Download</div>
    </div>

    <div class="cf-body" id="cf-tab-bridge">
      <div class="cf-status-box">
        <div class="cf-status-row">
          <span style="color:#94a3b8">Bridge Daemon:</span>
          <span class="cf-pill cf-pill-green" id="cf-bridge-status">ONLINE (8791)</span>
        </div>
        <div class="cf-status-row">
          <span style="color:#94a3b8">Keep-Awake Shield:</span>
          <span class="cf-pill cf-pill-cyan" id="cf-awake-status">ACTIVE (WebRTC+Audio)</span>
        </div>
        <div class="cf-status-row">
          <span style="color:#94a3b8">Flow Composer:</span>
          <span class="cf-pill cf-pill-cyan" id="cf-direct-status">DIRECT MODE</span>
        </div>
      </div>
      <p style="font-size:10px; color:#94a3b8; line-height:1.5; margin:0;">
        ⚡ <b>Connect Flow Bridge</b> connects your coding agents (Claude, Gemini, Cursor) directly to this tab. Generations bypass the chat interview for instant execution.
      </p>
    </div>

    <div class="cf-body" id="cf-tab-batch" style="display:none;">
      <span style="font-size:10px; font-weight:700; color:#7dd3fc; text-transform:uppercase;">Prompts (One per line)</span>
      <textarea id="cf-batch-prompts" class="cf-textarea" placeholder="A cinematic [animal] wearing [attire]&#10;Macro photo of an ice crystal in 1:1&#10;@Achernar speaking about the stars"></textarea>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span id="cf-batch-count" style="font-size:10px; color:#94a3b8;">0 prompt(s)</span>
        <button id="cf-paste-composer" class="cf-btn-primary" style="padding:6px 12px; font-size:10px;">Send to Flow</button>
      </div>
    </div>

    <div class="cf-body" id="cf-tab-vars" style="display:none;">
      <span style="font-size:10px; font-weight:700; color:#7dd3fc; text-transform:uppercase;">Combinatorial Smart Variables</span>
      <p style="font-size:10px; color:#94a3b8; margin:0;">Use <code>[variable]</code> in prompts to multiply outputs.</p>
      <div id="cf-vars-list" style="display:flex; flex-wrap:wrap; gap:4px;">
        <span class="cf-chip">[animal]: fox, wolf, tiger</span>
        <span class="cf-chip">[color]: cyan, amber, neon</span>
      </div>
    </div>

    <div class="cf-body" id="cf-tab-downloads" style="display:none;">
      <span style="font-size:10px; font-weight:700; color:#7dd3fc; text-transform:uppercase;">Direct Tile Downloader</span>
      <div style="display:flex; gap:8px;">
        <select id="cf-dl-format" style="flex:1; background:#000; color:#fff; border:1px solid rgba(0,229,255,0.2); border-radius:8px; padding:6px; font-size:10px;">
          <option value="all">All Media</option>
          <option value="image">Images Only</option>
          <option value="video">Videos Only</option>
        </select>
        <button id="cf-dl-all-btn" class="cf-btn-primary" style="flex:1; padding:6px;">Download All</button>
      </div>
      <p id="cf-dl-status" style="font-size:10px; color:#94a3b8; margin:0;">Ready to download tiles from grid.</p>
    </div>
  `;

  document.body.appendChild(hud);

  // ---- 6. UI Tab Switching & Minimizing ----
  const tabs = hud.querySelectorAll('.cf-tab');
  const panels = hud.querySelectorAll('.cf-body');

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(x => x.style.display = 'none');
      t.classList.add('active');
      const target = hud.querySelector(`#cf-tab-${t.dataset.tab}`);
      if (target) target.style.display = 'flex';
    });
  });

  const minBtn = hud.querySelector('#cf-min-btn');
  minBtn.addEventListener('click', () => {
    hud.classList.toggle('minimized');
  });

  const awakeBtn = hud.querySelector('#cf-keep-awake-btn');
  awakeBtn.addEventListener('click', () => {
    if (keepAwakeActive) {
      disableKeepAwake();
      hud.querySelector('#cf-awake-status').textContent = 'SUSPENDED';
      hud.querySelector('#cf-awake-status').className = 'cf-pill cf-pill-gray';
    } else {
      enableKeepAwake();
      hud.querySelector('#cf-awake-status').textContent = 'ACTIVE (WebRTC+Audio)';
      hud.querySelector('#cf-awake-status').className = 'cf-pill cf-pill-cyan';
    }
  });

  // ---- 7. Batch Prompts Sender ----
  const batchText = hud.querySelector('#cf-batch-prompts');
  const batchCount = hud.querySelector('#cf-batch-count');
  const sendBtn = hud.querySelector('#cf-paste-composer');

  batchText.addEventListener('input', () => {
    const lines = batchText.value.split('\n').filter(l => l.trim().length > 0);
    batchCount.textContent = `${lines.length} prompt(s)`;
  });

  sendBtn.addEventListener('click', () => {
    const lines = batchText.value.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return;
    
    // Paste first prompt into Flow editor
    const editor = document.querySelector('flow-rich-text-editor .ProseMirror, textarea, [contenteditable="true"]');
    if (editor) {
      editor.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', lines[0]);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
  });

  // ---- 8. Direct Download Button ----
  const dlAllBtn = hud.querySelector('#cf-dl-all-btn');
  const dlStatus = hud.querySelector('#cf-dl-status');

  dlAllBtn.addEventListener('click', async () => {
    const mediaNodes = Array.from(document.querySelectorAll('flow-image-tile img, flow-video-tile video, img[data-media-id], flow-video-tile img.thumbnail'));
    if (mediaNodes.length === 0) {
      dlStatus.textContent = 'No generated media found on screen.';
      return;
    }

    dlStatus.textContent = `Found ${mediaNodes.length} items. Saving...`;
    let count = 0;
    for (const node of mediaNodes) {
      const src = node.currentSrc || node.src;
      if (!src || src.startsWith('data:image/svg')) continue;
      
      const isVideo = node.tagName === 'VIDEO' || src.includes('.mp4') || src.includes('video');
      const filename = `flow_${Date.now()}_${count + 1}.${isVideo ? 'mp4' : 'png'}`;
      
      try {
        const a = document.createElement('a');
        a.href = src;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        count++;
        await new Promise(r => setTimeout(r, 400));
      } catch (_) {}
    }
    dlStatus.textContent = `Successfully triggered download for ${count} asset(s).`;
  });

  // ---- 9. Live Bridge Daemon Healthcheck ----
  setInterval(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8791/status?site=flow');
      if (res.ok) {
        const data = await res.json();
        const badge = hud.querySelector('#cf-bridge-status');
        if (badge) {
          badge.textContent = `ONLINE (v${data.bridgeVersion || '1.3.1'})`;
          badge.className = 'cf-pill cf-pill-green';
        }
      }
    } catch (_) {
      const badge = hud.querySelector('#cf-bridge-status');
      if (badge) {
        badge.textContent = 'OFFLINE (run connect-flow bridge start)';
        badge.className = 'cf-pill cf-pill-gray';
      }
    }
  }, 4000);

})();
