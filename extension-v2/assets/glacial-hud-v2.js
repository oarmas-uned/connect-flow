/**
 * Connect Flow V2 Beta — In-Page Glacial HUD & Anti-Throttling Keep-Awake Engine
 * Specially designed to run seamlessly alongside Connect Flow V1 without collision.
 */

(function () {
  'use strict';

  if (window.__connect_flow_v2_hud_injected) return;
  window.__connect_flow_v2_hud_injected = true;

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
        pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {});
        pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {});
        pc1.createDataChannel('connect-flow-v2-awake');
        pc1.createOffer()
          .then((offer) => pc1.setLocalDescription(offer))
          .then(() => pc2.setRemoteDescription(pc1.localDescription))
          .then(() => pc2.createAnswer())
          .then((answer) => pc2.setLocalDescription(answer))
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
      keepAwakePeers.forEach((pc) => { try { pc.close(); } catch (_) {} });
      keepAwakePeers = null;
    }
  }

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

  setInterval(() => {
    try { enforceDirectMode(); } catch (_) {}
  }, 4000);

  // ---- 3. Glacial Styles for V2 ----
  const style = document.createElement('style');
  style.id = 'connect-flow-v2-hud-styles';
  style.textContent = `
    #cf-v2-floating-hud {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      background: rgba(7, 12, 20, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(126, 231, 252, 0.3);
      border-radius: 18px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(126, 231, 252, 0.2);
      z-index: 2147483646;
      color: #f0f7ff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #cf-v2-floating-hud.side-by-side {
      right: 400px;
    }

    #cf-v2-floating-hud.minimized {
      height: 48px;
      width: 220px;
      border-radius: 24px;
    }

    #cf-v2-floating-hud .cf-header {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(126, 231, 252, 0.15);
      background: linear-gradient(180deg, rgba(20, 35, 55, 0.6) 0%, rgba(10, 18, 30, 0.6) 100%);
      cursor: pointer;
    }

    #cf-v2-floating-hud .cf-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      color: #f0f7ff;
      font-size: 13px;
    }

    #cf-v2-floating-hud .cf-v2-badge {
      font-size: 9px;
      background: rgba(126, 231, 252, 0.15);
      border: 1px solid rgba(126, 231, 252, 0.4);
      color: #7ee7fc;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 800;
    }

    #cf-v2-floating-hud .cf-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    #cf-v2-floating-hud .cf-icon-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      display: flex;
      border-radius: 6px;
    }

    #cf-v2-floating-hud .cf-icon-btn:hover {
      color: #7ee7fc;
      background: rgba(126, 231, 252, 0.1);
    }

    #cf-v2-floating-hud .cf-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #cf-v2-floating-hud .cf-status-box {
      background: rgba(4, 8, 14, 0.7);
      border: 1px solid rgba(126, 231, 252, 0.12);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #cf-v2-floating-hud .cf-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    #cf-v2-floating-hud .cf-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    #cf-v2-floating-hud .cf-pill-green {
      background: rgba(52, 211, 153, 0.15);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.3);
    }

    #cf-v2-floating-hud .cf-pill-cyan {
      background: rgba(126, 231, 252, 0.15);
      color: #7ee7fc;
      border: 1px solid rgba(126, 231, 252, 0.3);
    }

    #cf-v2-floating-hud .cf-pill-gray {
      background: rgba(100, 116, 139, 0.15);
      color: #94a3b8;
      border: 1px solid rgba(100, 116, 139, 0.3);
    }
  `;

  document.head.appendChild(style);

  // ---- 4. Create V2 HUD Element ----
  const hud = document.createElement('div');
  hud.id = 'cf-v2-floating-hud';

  // Check if V1 HUD is already present
  if (document.querySelector('#cf-floating-hud')) {
    hud.classList.add('side-by-side');
  }

  hud.innerHTML = `
    <div class="cf-header" id="cf-v2-header">
      <div class="cf-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#7ee7fc" stroke-width="2" stroke-dasharray="4 2" />
          <path d="M7 12L11 16L17 8" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Connect Flow</span>
        <span class="cf-v2-badge">V2 BETA</span>
      </div>
      <div class="cf-actions">
        <button class="cf-icon-btn" id="cf-v2-min-btn" title="Minimize / Expand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="cf-body" id="cf-v2-body">
      <div class="cf-status-box">
        <div class="cf-status-row">
          <span style="color:#94a3b8">Antigravity Bridge:</span>
          <span class="cf-pill cf-pill-green" id="cf-v2-bridge-status">ONLINE (8791)</span>
        </div>
        <div class="cf-status-row">
          <span style="color:#94a3b8">Engine Core:</span>
          <span class="cf-pill cf-pill-cyan">ANGULAR DIRECT</span>
        </div>
        <div class="cf-status-row">
          <span style="color:#94a3b8">Active Model:</span>
          <span class="cf-pill cf-pill-cyan">🍌 NANO BANANA PRO</span>
        </div>
        <div class="cf-status-row">
          <span style="color:#94a3b8">Keep-Awake Shield:</span>
          <span class="cf-pill cf-pill-cyan" id="cf-v2-awake-status">ACTIVE (V2)</span>
        </div>
      </div>
      <p style="font-size:10px; color:#94a3b8; line-height:1.5; margin:0;">
        ⚡ <b>Connect Flow V2</b> running with direct CDP insertion, 30 character voices, and 1:1 Nano Banana Pro. Compatible with V1.
      </p>
    </div>
  `;

  document.body.appendChild(hud);

  // Minimize toggle
  hud.querySelector('#cf-v2-min-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    hud.classList.toggle('minimized');
  });

  hud.querySelector('#cf-v2-header').addEventListener('click', () => {
    hud.classList.toggle('minimized');
  });

  // Global Bridge Hook for V2
  window.__connect_flow_v2_set_bridge_status = (connected, activeJobPrompt) => {
    const badge = hud.querySelector('#cf-v2-bridge-status');
    if (badge) {
      if (connected) {
        badge.textContent = activeJobPrompt ? 'AGENT RUNNING...' : 'ONLINE (8791)';
        badge.className = 'cf-pill cf-pill-green';
      } else {
        badge.textContent = 'STANDBY';
        badge.className = 'cf-pill cf-pill-gray';
      }
    }
  };

  // Keep checking if V1 appears dynamically
  setInterval(() => {
    if (document.querySelector('#cf-floating-hud') && !hud.classList.contains('side-by-side')) {
      hud.classList.add('side-by-side');
    }
  }, 2000);
})();
