/**
 * Connect Flow V2 Beta — Side Panel Dashboard Controller
 */

'use strict';

// Elements
const bridgeDot = document.getElementById('bridge-status-dot');
const bridgeText = document.getElementById('bridge-status-text');
const btnPing = document.getElementById('btn-ping-bridge');
const logsContainer = document.getElementById('console-logs-container');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Studio elements
const studioPrompt = document.getElementById('studio-prompt');
const studioModel = document.getElementById('studio-model');
const studioVoice = document.getElementById('studio-voice');
const fieldDuration = document.getElementById('field-duration');
const fieldVoice = document.getElementById('field-voice');
const fieldCount = document.getElementById('field-count');
const btnGenerate = document.getElementById('btn-generate-studio');
const studioProgress = document.getElementById('studio-progress');
const studioProgressBar = document.getElementById('studio-progress-bar');
const studioProgressPct = document.getElementById('studio-progress-pct');
const studioProgressText = document.getElementById('studio-progress-text');

// Batch elements
const batchPrompts = document.getElementById('batch-prompts');
const batchVars = document.getElementById('batch-vars');
const batchNamer = document.getElementById('batch-namer');
const btnRunBatch = document.getElementById('btn-run-batch');
const batchProgress = document.getElementById('batch-progress');
const batchProgressBar = document.getElementById('batch-progress-bar');
const batchProgressPct = document.getElementById('batch-progress-pct');

// Active Agent Card
const cardActiveJob = document.getElementById('card-active-job');
const activeJobPrompt = document.getElementById('active-job-prompt');
const activeJobBar = document.getElementById('active-job-bar');
const activeJobPct = document.getElementById('active-job-pct');
const activeJobStage = document.getElementById('active-job-stage');

// State
let selectedMode = 'image';
let selectedRatio = '1:1';
let selectedCount = 1;
let selectedDuration = '8s';

// --- Tab Switching ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-tab'));
    if (target) target.classList.add('active');
  });
});

// --- Chip Groups ---
function setupChipGroup(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      onChange(chip.getAttribute('data-val'));
    });
  });
}

setupChipGroup('group-mode', (val) => {
  selectedMode = val;
  if (val === 'video') {
    fieldDuration.style.display = 'flex';
    fieldVoice.style.display = 'flex';
    fieldCount.style.display = 'none';
    studioModel.value = 'Veo 3.1 - Fast';
  } else {
    fieldDuration.style.display = 'none';
    fieldVoice.style.display = 'none';
    fieldCount.style.display = 'flex';
    studioModel.value = '🍌 Nano Banana Pro';
  }
});

setupChipGroup('group-ratio', (val) => {
  selectedRatio = val;
});

setupChipGroup('group-count', (val) => {
  selectedCount = Number(val) || 1;
});

setupChipGroup('group-duration', (val) => {
  selectedDuration = val;
});

// --- Logging Helper ---
function appendLog(level, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  const now = new Date();
  const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
  entry.innerHTML = `<span class="log-time">${timeStr}</span><span>${escapeHtml(message)}</span>`;
  logsContainer.appendChild(entry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

btnClearLogs.addEventListener('click', () => {
  logsContainer.innerHTML = '';
});

// --- Bridge Connection Check ---
async function checkBridgeStatus() {
  try {
    const res = await fetch('http://127.0.0.1:8791/status', { method: 'GET', signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      bridgeDot.classList.add('connected');
      bridgeText.textContent = `Bridge: Online (${data.plan || 'pro'})`;
      return true;
    }
  } catch (_) {}

  bridgeDot.classList.remove('connected');
  bridgeText.textContent = 'Bridge Standby';
  return false;
}

btnPing.addEventListener('click', async () => {
  appendLog('info', 'Pinging Antigravity Local Bridge on http://127.0.0.1:8791 ...');
  const ok = await checkBridgeStatus();
  if (ok) {
    appendLog('info', 'Bridge ping successful! Extension and agent daemon are in sync.');
  } else {
    appendLog('warn', 'Bridge daemon offline. Run "connect-flow bridge" in your terminal to start it.');
  }
});

// Periodic Bridge Ping
checkBridgeStatus();
setInterval(checkBridgeStatus, 6000);

// --- Find Active Flow Tab ---
async function getFlowTab() {
  const tabs = await chrome.tabs.query({ url: ['*://flow.google.com/*', '*://labs.google/*'] });
  return tabs.length > 0 ? tabs[0] : null;
}

// --- Direct Generation Trigger ---
btnGenerate.addEventListener('click', async () => {
  const prompt = studioPrompt.value.trim();
  if (!prompt) {
    alert('Please enter a prompt first.');
    return;
  }

  const flowTab = await getFlowTab();
  if (!flowTab || !flowTab.id) {
    alert('No Google Flow tab detected. Please open https://flow.google.com in Chrome.');
    return;
  }

  btnGenerate.disabled = true;
  studioProgress.style.display = 'flex';
  studioProgressBar.style.width = '15%';
  studioProgressPct.textContent = '15%';
  studioProgressText.textContent = 'Submitting in Direct Mode...';

  appendLog('info', `[Studio] Dispatching ${selectedMode} prompt to Flow: "${prompt.slice(0, 60)}..."`);

  const payload = {
    promptIndex: 1,
    prompt,
    mode: selectedMode,
    model: studioModel.value,
    aspectRatio: selectedRatio,
    outputCount: selectedCount,
    videoOption: selectedDuration,
    speaker: studioVoice.value || undefined,
    autoDownloadResourceQuality: selectedMode === 'video' ? '720' : '2k'
  };

  try {
    chrome.tabs.sendMessage(
      flowTab.id,
      {
        type: 'AUTO_FILL_FLOW',
        groupId: `studio-${Date.now()}`,
        payloads: [payload],
        concurrentPrompts: 1,
        promptDelaySecondsMin: 0,
        promptDelaySecondsMax: 0
      },
      (response) => {
        if (!response || !response.success) {
          appendLog('error', `Generation failed: ${response?.error || 'Could not communicate with Flow tab'}`);
          btnGenerate.disabled = false;
          studioProgress.style.display = 'none';
        }
      }
    );
  } catch (err) {
    appendLog('error', `Error dispatching generation: ${err.message}`);
    btnGenerate.disabled = false;
    studioProgress.style.display = 'none';
  }
});

// --- Smart Combinatorics Batch Expansion ---
function expandPrompts(templateLines, varLines) {
  const varMap = {};
  for (const line of varLines) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const vals = line.slice(idx + 1).split(',').map((v) => v.trim()).filter(Boolean);
      if (key && vals.length) varMap[key] = vals;
    }
  }

  const keys = Object.keys(varMap);
  let combinations = [{}];
  for (const key of keys) {
    const next = [];
    for (const combo of combinations) {
      for (const val of varMap[key]) {
        next.push({ ...combo, [key]: val });
      }
    }
    combinations = next;
  }

  const results = [];
  for (const t of templateLines) {
    for (const combo of combinations) {
      let expanded = t;
      for (const [k, v] of Object.entries(combo)) {
        expanded = expanded.replaceAll(`{${k}}`, v);
      }
      results.push(expanded);
    }
  }
  return results;
}

btnRunBatch.addEventListener('click', async () => {
  const rawPrompts = batchPrompts.value.split('\n').map((l) => l.trim()).filter(Boolean);
  const rawVars = batchVars.value.split('\n').map((l) => l.trim()).filter(Boolean);

  if (!rawPrompts.length) {
    alert('Please enter at least one prompt.');
    return;
  }

  const expanded = expandPrompts(rawPrompts, rawVars);
  appendLog('info', `[Batch] Expanded ${rawPrompts.length} prompt(s) into ${expanded.length} permutation(s).`);

  const flowTab = await getFlowTab();
  if (!flowTab || !flowTab.id) {
    alert('No Google Flow tab detected.');
    return;
  }

  const payloads = expanded.map((p, idx) => ({
    promptIndex: idx + 1,
    prompt: p,
    mode: selectedMode,
    model: studioModel.value,
    aspectRatio: selectedRatio,
    outputCount: 1,
    autoDownloadResourceQuality: '2k'
  }));

  btnRunBatch.disabled = true;
  batchProgress.style.display = 'flex';
  batchProgressBar.style.width = '10%';
  batchProgressPct.textContent = `0/${payloads.length}`;

  chrome.tabs.sendMessage(
    flowTab.id,
    {
      type: 'AUTO_FILL_FLOW',
      groupId: `batch-${Date.now()}`,
      payloads,
      concurrentPrompts: 1,
      promptDelaySecondsMin: 2,
      promptDelaySecondsMax: 5
    },
    (res) => {
      if (!res || !res.success) {
        appendLog('error', `Batch dispatch failed: ${res?.error || 'Connection error'}`);
        btnRunBatch.disabled = false;
        batchProgress.style.display = 'none';
      }
    }
  );
});

// --- Listen to Runtime Events & Logs ---
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;

  switch (msg.type) {
    case 'ACTION_LOG': {
      const data = msg.data;
      if (data && data.message) {
        appendLog(data.level || 'info', data.message);
      }
      break;
    }

    case 'VIDEO_GENERATION_PROGRESS': {
      const { percentage, status } = msg.data || {};
      if (percentage !== undefined) {
        studioProgressBar.style.width = `${percentage}%`;
        studioProgressPct.textContent = `${percentage}%`;
        studioProgressText.textContent = status || 'Generating...';

        if (percentage >= 100) {
          setTimeout(() => {
            btnGenerate.disabled = false;
            studioProgress.style.display = 'none';
          }, 1500);
        }
      }
      break;
    }

    case 'PROMPT_GROUP_STATUS': {
      const data = msg.data || {};
      if (data.totalCount) {
        const pct = Math.round((data.processedCount / data.totalCount) * 100);
        batchProgressBar.style.width = `${pct}%`;
        batchProgressPct.textContent = `${data.processedCount}/${data.totalCount}`;

        if (data.status === 'completed' || data.status === 'cancelled') {
          btnRunBatch.disabled = false;
          setTimeout(() => {
            batchProgress.style.display = 'none';
          }, 2000);
        }
      }
      break;
    }
  }
});
