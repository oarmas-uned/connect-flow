/**
 * Connect Flow V2 Beta — Background Service Worker
 * Comprehensive CDP Driver, Download Orchestrator, Tab Protector & Agent Bridge
 */

'use strict';

const debuggerTabs = new Set();
const urlToFilename = new Map();
let currentFolderPrefix = '';
let currentFilePrefix = '';
let autoRenameEnabled = true;
let filenameListenerTimer = null;

// Clean up detached tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  debuggerTabs.delete(tabId);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) {
    debuggerTabs.delete(source.tabId);
  }
});

// Download filename determiner
const onDeterminingFilenameHandler = (item, suggest) => {
  const isGoogle = item.url && item.url.includes('google');
  const isExt = !item.byExtensionId || item.byExtensionId === chrome.runtime.id;

  if (isGoogle && isExt) {
    const isVideo = /\.(mp4)$/i.test(item.filename || item.url);
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|jfif)$/i.test(item.filename || item.url);

    if (isVideo || isImage) {
      if (!autoRenameEnabled) return;
      if (urlToFilename.has(item.url)) {
        suggest({ filename: urlToFilename.get(item.url) });
        urlToFilename.delete(item.url);
      } else {
        const raw = item.filename || 'download';
        const base = raw.split('/').pop().split('\\').pop() || raw;
        const target = `${currentFolderPrefix}${currentFilePrefix}${base}`;
        suggest({ filename: target });
      }
    }
  }
};

// Initialize Side Panel configuration
async function initSidePanel() {
  if (chrome.sidePanel) {
    try {
      await chrome.sidePanel.setOptions({
        path: 'src/ui/side-panel/index.html',
        enabled: true
      });
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
      });
    } catch (_) {}
  }
}

initSidePanel();

chrome.runtime.onInstalled.addListener(async (details) => {
  await initSidePanel();
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const tabs = await chrome.tabs.query({
        url: ['*://flow.google.com/*', '*://labs.google/*']
      });
      for (const t of tabs) {
        if (t.id) {
          try {
            await chrome.tabs.reload(t.id);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
});

// Action click opens side panel and activates Flow tab
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && tab && tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (_) {}
  }

  try {
    const tabs = await chrome.tabs.query({
      url: ['*://flow.google.com/*', '*://labs.google/*']
    });
    if (tabs.length > 0 && tabs[0].id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) {
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: 'https://flow.google.com', active: true });
    }
  } catch (_) {}
});

// Primary Chrome Runtime Message Router
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || !msg.type) return false;

  const tabId = sender && sender.tab ? sender.tab.id : undefined;

  switch (msg.type) {
    case 'FA_KEEP_TAB_LOADED': {
      if (typeof tabId !== 'number') {
        respond({ success: false, error: 'FA_KEEP_TAB_LOADED requires sender tab' });
        return false;
      }
      chrome.tabs.update(tabId, { autoDiscardable: !msg.keep }).then(
        () => respond({ success: true }),
        (e) => respond({ success: false, error: String(e && e.message || e) })
      );
      return true;
    }

    case 'SET_ZOOM': {
      const { zoomFactor } = msg;
      if (tabId) {
        chrome.tabs.setZoom(tabId, zoomFactor);
        respond({ success: true });
      } else {
        respond({ success: false, error: 'Tab ID missing' });
      }
      return false;
    }

    case 'DOWNLOAD_VIDEO':
    case 'DOWNLOAD_IMAGE': {
      const { url, filename, folder, autoChangeFileName } = msg;
      if (autoChangeFileName !== false) {
        const fullPath = folder ? `${folder}/${filename}` : filename;
        urlToFilename.set(url, fullPath);
        chrome.downloads.download({ url, filename: fullPath, saveAs: false }, (id) => {
          const err = chrome.runtime.lastError;
          respond(!err && id ? { success: true, downloadId: id } : { success: false, error: err?.message || 'Download failed' });
        });
      } else {
        chrome.downloads.download({ url, saveAs: false }, (id) => {
          const err = chrome.runtime.lastError;
          respond(!err && id ? { success: true, downloadId: id } : { success: false, error: err?.message || 'Download failed' });
        });
      }
      return true;
    }

    case 'SET_FOLDER_NAME': {
      const { folderName, prefix, autoChangeFileName } = msg;
      if (typeof folderName === 'string') {
        currentFolderPrefix = folderName.trim() ? `${folderName.trim()}/` : '';
      }
      if (typeof prefix === 'string') {
        currentFilePrefix = prefix.trim();
      }
      if (typeof autoChangeFileName === 'boolean') {
        autoRenameEnabled = autoChangeFileName;
      }

      if (autoRenameEnabled) {
        if (filenameListenerTimer) {
          clearTimeout(filenameListenerTimer);
          filenameListenerTimer = null;
        }
        if (!chrome.downloads.onDeterminingFilename.hasListener(onDeterminingFilenameHandler)) {
          chrome.downloads.onDeterminingFilename.addListener(onDeterminingFilenameHandler);
        }
      } else {
        if (filenameListenerTimer) {
          clearTimeout(filenameListenerTimer);
          filenameListenerTimer = null;
        }
        if (chrome.downloads.onDeterminingFilename.hasListener(onDeterminingFilenameHandler)) {
          chrome.downloads.onDeterminingFilename.removeListener(onDeterminingFilenameHandler);
        }
      }
      respond({ success: true });
      return false;
    }

    case 'PROMPT_GROUP_STATUS': {
      const status = msg.data?.status;
      if (status === 'completed' || status === 'cancelled' || status === 'error') {
        if (filenameListenerTimer) clearTimeout(filenameListenerTimer);
        filenameListenerTimer = setTimeout(() => {
          filenameListenerTimer = null;
          if (chrome.downloads.onDeterminingFilename.hasListener(onDeterminingFilenameHandler)) {
            chrome.downloads.onDeterminingFilename.removeListener(onDeterminingFilenameHandler);
          }
        }, 300000);
      }
      return false;
    }

    // CDP Attach
    case 'CA': {
      if (!tabId) {
        respond({ success: false, error: 'No tab ID' });
        return false;
      }
      (async () => {
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          debuggerTabs.add(tabId);
          respond({ success: true });
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          if (m.includes('already attached')) {
            debuggerTabs.add(tabId);
            respond({ success: true });
          } else {
            respond({ success: false, error: m });
          }
        }
      })();
      return true;
    }

    // CDP Detach
    case 'CD': {
      if (!tabId) {
        respond({ success: false, error: 'No tab ID' });
        return false;
      }
      (async () => {
        try {
          if (debuggerTabs.has(tabId)) {
            await chrome.debugger.detach({ tabId });
            debuggerTabs.delete(tabId);
          }
          respond({ success: true });
        } catch (err) {
          debuggerTabs.delete(tabId);
          respond({ success: false, error: String(err) });
        }
      })();
      return true;
    }

    // CDP Insert Text (CIT)
    case 'CIT': {
      const { text } = msg;
      if (!tabId) {
        respond({ success: false, error: 'No tab ID' });
        return false;
      }
      (async () => {
        const target = { tabId };
        try {
          if (!debuggerTabs.has(tabId)) {
            await chrome.debugger.attach(target, '1.3');
            debuggerTabs.add(tabId);
          }
          await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
          respond({ success: true });
        } catch (err) {
          respond({ success: false, error: String(err && err.message || err) });
        }
      })();
      return true;
    }

    // CDP Click (CC)
    case 'CC': {
      const { x, y } = msg;
      if (!tabId) {
        respond({ success: false, error: 'No tab ID' });
        return false;
      }
      const target = { tabId };
      const jitter = () => Math.round(4 * (Math.random() - 0.5));
      const jx = Math.max(0, x + jitter());
      const jy = Math.max(0, y + jitter());

      (async () => {
        try {
          if (!debuggerTabs.has(tabId)) {
            await chrome.debugger.attach(target, '1.3');
            debuggerTabs.add(tabId);
          }
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: jx,
            y: jy,
            button: 'none',
            modifiers: 0
          });
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: jx,
            y: jy,
            button: 'left',
            buttons: 1,
            clickCount: 1,
            modifiers: 0
          });
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: jx,
            y: jy,
            button: 'left',
            buttons: 0,
            clickCount: 1,
            modifiers: 0
          });
          respond({ success: true });
        } catch (err) {
          respond({ success: false, error: String(err && err.message || err) });
        }
      })();
      return true;
    }

    // CDP Key Event (CK)
    case 'CK': {
      const { key, keyCode, code } = msg;
      if (!tabId) {
        respond({ success: false, error: 'No tab ID' });
        return false;
      }
      (async () => {
        const target = { tabId };
        try {
          if (!debuggerTabs.has(tabId)) {
            await chrome.debugger.attach(target, '1.3');
            debuggerTabs.add(tabId);
          }
          const payload = {
            key,
            code,
            windowsVirtualKeyCode: keyCode,
            nativeVirtualKeyCode: keyCode
          };
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'keyDown',
            ...payload
          });
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            ...payload
          });
          respond({ success: true });
        } catch (err) {
          respond({ success: false, error: String(err && err.message || err) });
        }
      })();
      return true;
    }
  }

  return false;
});
