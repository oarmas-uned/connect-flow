/**
 * Connect Flow V2 Beta — AI Agent Direct Bridge
 * Connects Google Flow page directly to Antigravity CLI, MCP Server & Local Daemon
 * Port: 8791 (http://127.0.0.1:8791 & ws://127.0.0.1:8791/ws)
 */

(function () {
  'use strict';

  const FA = (globalThis.FA = globalThis.FA || {});
  const D = FA.driver;

  const BRIDGE_WS_URL = 'ws://127.0.0.1:8791/ws';
  const BRIDGE_HTTP_URL = 'http://127.0.0.1:8791';

  let ws = null;
  let isConnected = false;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let activeJobId = null;

  function updateHudBridgeStatus(connected, activeJobPrompt = null) {
    if (typeof window.__connect_flow_v2_set_bridge_status === 'function') {
      window.__connect_flow_v2_set_bridge_status(connected, activeJobPrompt);
    }
    if (typeof window.__connect_flow_set_bridge_status === 'function') {
      window.__connect_flow_set_bridge_status(connected, activeJobPrompt);
    }
  }

  function connectToAgentBridge() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      ws = new WebSocket(BRIDGE_WS_URL);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      isConnected = true;
      updateHudBridgeStatus(true);
      if (D && D.log) D.log.info('Antigravity Agent Bridge connected on port 8791');

      // Handshake
      send({
        t: 'ext.hello',
        version: '2.0.0-beta',
        client: 'v2-extension',
        plan: 'pro',
        flowTab: !document.hidden,
        title: document.title,
        url: location.href,
        capabilities: {
          directMode: true,
          models: [
            '🍌 Nano Banana Pro',
            '🍌 Nano Banana 2',
            '🍌 Nano Banana 2 Lite',
            'Veo 3.1 - Fast',
            'Veo 3.1 - Quality',
            'Omni 1.1 Flash'
          ],
          voices: true,
          startEndFrames: true,
          smartVariables: true
        }
      });

      // Heartbeat every 10s
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (isConnected) {
          send({ t: 'ext.heartbeat', flowTab: !document.hidden });
        }
      }, 10000);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleBridgeMessage(msg);
      } catch (err) {
        if (D && D.log) D.log.error('Agent Bridge parse error:', err.message);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      updateHudBridgeStatus(false);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      scheduleReconnect();
    };

    ws.onerror = () => {
      try { ws.close(); } catch (_) {}
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToAgentBridge();
    }, 4000);
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (isConnected) {
      send({
        t: 'ext.status',
        flowTab: !document.hidden,
        plan: 'pro'
      });
    }
  });

  async function handleBridgeMessage(msg) {
    if (!msg || !msg.t) return;

    switch (msg.t) {
      case 'bridge.hello':
        if (D && D.log) D.log.info(`Bridge daemon version: ${msg.bridgeVersion || '2.0.0-beta'}`);
        break;

      case 'job.dispatch': {
        const { jobId, job } = msg;
        if (!jobId || !job) return;

        activeJobId = jobId;
        send({ t: 'job.accepted', jobId });
        updateHudBridgeStatus(true, job.prompt);

        if (D && D.log) {
          D.log.info(`[AI Agent Job ${jobId}] Received: "${job.prompt.slice(0, 80)}" (Mode: ${job.mode || 'image'})`);
        }

        try {
          await executeAgentJob(jobId, job);
        } catch (err) {
          send({
            t: 'job.failed',
            jobId,
            error: err.message || String(err)
          });
        } finally {
          activeJobId = null;
          updateHudBridgeStatus(true, null);
        }
        break;
      }

      case 'job.cancel': {
        if (activeJobId && activeJobId === msg.jobId) {
          if (D && D.log) D.log.warn(`[AI Agent Job ${msg.jobId}] Cancel requested`);
        }
        break;
      }
    }
  }

  async function executeAgentJob(jobId, job) {
    if (!FA.stepMachine || typeof FA.stepMachine.runPrompt !== 'function') {
      throw new Error('Automation Step Machine not loaded in Flow page');
    }

    const params = job.params || {};

    const payload = {
      promptIndex: 1,
      prompt: job.prompt,
      mode: job.mode || 'image',
      model: params.model || '🍌 Nano Banana Pro',
      aspectRatio: params.ratio || '1:1',
      outputCount: params.count || 1,
      videoOption: params.duration || '8s',
      speaker: params.voice,
      images: params.ingredients || [],
      folderName: params.folderName || 'connect-flow',
      autoChangeFileName: true,
      autoDownloadResourceQuality: params.quality || (job.mode === 'video' ? '720' : '2k')
    };

    send({
      t: 'job.progress',
      jobId,
      stage: 'preparing',
      percentage: 10
    });

    const result = await FA.stepMachine.runPrompt(payload, {
      applySettings: true,
      onPhase: (phase, mediaIds) => {
        send({
          t: 'job.progress',
          jobId,
          stage: phase,
          percentage: phase === 'generated' ? 85 : 50,
          mediaIds: Array.from(mediaIds || [])
        });
      }
    });

    if (result.success) {
      const files = (result.downloads || []).map((d) => ({
        mediaId: d.mediaId,
        tier: d.tier
      }));

      send({
        t: 'job.result',
        jobId,
        files: files.length > 0 ? files : [{ mediaId: 'downloaded', tier: '2k' }],
        mediaIds: Array.from(result.mediaIds || []),
        success: true
      });
      if (D && D.log) {
        D.log.info(`[AI Agent Job ${jobId}] Completed successfully with ${result.mediaIds.size || 1} output(s)`);
      }
    } else {
      throw new Error(result.error || 'Generation failed without error message');
    }
  }

  // Self-start bridge client
  connectToAgentBridge();

  FA.agentBridge = {
    connect: connectToAgentBridge,
    isConnected: () => isConnected,
    send
  };
})();
