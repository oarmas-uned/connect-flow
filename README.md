# Connect Flow ❄️⚡ (V2 Beta)

[![Version](https://img.shields.io/badge/version-2.0.0--beta-00d2ff.svg)](https://github.com/oarmas-uned/connect-flow/tree/v2-beta)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![UI: Pale Glacier Blue](https://img.shields.io/badge/UI-Pale%20Glacier%20Blue-7dd3fc.svg)](https://flow.google.com)
[![Engine: Human--Level Angular Material](https://img.shields.io/badge/Engine-Human--Level%20Angular-0284c7.svg)](https://flow.google.com)
[![Ratio: 1:1 Default](https://img.shields.io/badge/Ratio-1%3A1%20Default-00e5ff.svg)](https://flow.google.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![MCP Server](https://img.shields.io/badge/MCP-Supported-purple.svg)](https://modelcontextprotocol.io/)

> **Connect Flow V2 Beta** gives AI coding agents (Antigravity, Claude Code, Cursor, Windsurf) and humans full, human-like generation capabilities on [Google Flow](https://flow.google.com) — using your own logged-in session with **zero API costs**.

---

## 🌟 What's New in V2 Beta

### 🧠 Full Human-Level Google Flow Automation Engine
- **Direct Mode Enforcement**: Automatically toggles Google Flow's `agent-mode-chip` to `aria-pressed="false"`, bypassing chat interviews and stalls for direct, deterministic generation straight into the media grid.
- **CDP Input & Mouse Jitter**: Uses Chrome DevTools Protocol (`Input.insertText` and `Input.dispatchMouseEvent` with subtle human micro-jitters) so ProseMirror registers prompt text cleanly without truncation.
- **Settled Virtual Scroller Diffing**: Correctly diffs `data-media-id` and video serving URLs against virtual-scroll recycles to eliminate false-positives and duplicate downloads.
- **Error & Safety Detection**: Distinguishes between usage limits, bot mitigation flags ("unusual activity"), policy refusals, and clarifying questions.

### 🎨 Pale Glacier Blue Studio & In-Page Glacial HUD
- **Glacial HUD**: Sleek floating frosted-glass HUD inside `flow.google.com` displaying real-time agent bridge status, keep-awake state, and direct downloads.
- **Side Panel Studio**: Complete dark frosted dashboard with 4 specialized tabs:
  1. **Bridge**: Live Antigravity MCP/CLI bridge status, incoming prompt watcher, and active task progress.
  2. **Studio**: Direct controls for Prompt, Mode (Image / Video), Model (Nano Banana Pro, Veo 3.1 Fast, Omni Flash), Aspect Ratio (1:1, 16:9, 9:16, 4:3, 3:4), Output Count (x1..x4), Video Duration (4s..10s), and Character Voices.
  3. **Batch**: Multi-line prompt runner with Smart Combinatorial Variables (`{subject}`, `{style}`) and permutation previews.
  4. **Logs**: Live color-coded diagnostic log console.
- **1:1 Cyber Flow Loop Icon Suite**: Clean, modern electric cyan & ice-blue loop icons (16, 32, 48, 128px) — zero igloos.

### 🛡️ Dual Anti-Throttling Keep-Awake Engine
- Opens an in-page self-looping WebRTC data channel and silent AudioContext, disabling Chrome's intensive 60s background timer throttling.
- Marks the Flow tab as `autoDiscardable: false` during batch runs to prevent Chrome from silently killing the session.

### 🎭 30 Flow Character Voices & Mentions
- Full integration with Google Flow's voice catalog (Zephyr, Nova, Alloy, Onyx, Breeze, Echo, Fable, Sol, Cove, Juniper, and 20 more).
- Automatically navigates Flow's Add Ingredients modal and selects character performances.

---

## 📦 Project Architecture

```
connect-flow/
├── manifest.json              # Chrome extension manifest (v2.0.0-beta, MV3)
├── service-worker-loader.js   # Background service worker loader
├── assets/                    # Pale Glacier Blue UI assets & Glacial HUD
│   └── glacial-hud.js         # Floating in-page HUD & WebRTC keep-awake
├── icons/                     # 1:1 Cyber Flow Loop icon suite (16, 32, 48, 128)
├── src/
│   ├── automation/            # Human-level Angular automation engine
│   │   ├── selectors.js       # Modern Google Flow Angular Material selector registry
│   │   ├── driver.js          # DOM primitives, CDP click/input, reachable point tests
│   │   ├── step-machine.js    # Direct mode prompt machine, settings & 4K/2K downloader
│   │   ├── agent-bridge.js    # Direct WebSocket bridge to Antigravity CLI/daemon (port 8791)
│   │   ├── content.js         # WebRTC keep-awake, batch queue & message router
│   │   └── background.js      # CDP debugger sessions, filename router, tab protector
│   └── ui/
│       └── side-panel/        # Pale Glacier Blue Extension Side Panel
│           ├── index.html     # Dashboard layout (Bridge, Studio, Batch, Logs)
│           ├── panel.js       # Controller & bridge telemetry
│           └── panel.css      # Pale Glacier Blue frosty design tokens
└── cli/                       # Standalone safe & real-time CLI + MCP bridge
    ├── bin/
    │   ├── connect-flow.mjs   # Main CLI executable
    │   └── connect-flow-mcp.mjs # Stdio MCP server
    ├── src/
    │   ├── cli.mjs            # Commander subcommands (generate, batch, status, doctor)
    │   ├── bridge-server.mjs  # Local bridge daemon (http://127.0.0.1:8791)
    │   ├── bridge-client.mjs  # Real-time WebSocket/HTTP bridge client
    │   ├── combinatorics.mjs  # Smart Variables matrix multiplier
    │   ├── constants.mjs      # Models, ratios, and 30 character voices
    │   ├── namer.mjs          # Automatic slugifier & custom namer templates
    │   ├── safety.mjs         # Tab health & anti-burst limiter
    │   └── streamer.mjs       # Real-time NDJSON event streamer
    └── test/                  # 11 unit test suites (all passing)
```

---

## 👥 Running V1 and V2 Side-by-Side

You can load and run both **Connect Flow V1** and **Connect Flow V2 Beta** simultaneously in Google Chrome without any conflict:

1. **V1 Classic**:
   - Location: `c:\Users\pc\Desktop\Coding\connect-flow\extension-v1`
   - Shortcut: `Alt+Shift+F`
   - Features: Original project sync & classic panel.

2. **V2 Beta**:
   - Location: `c:\Users\pc\Desktop\Coding\connect-flow\extension-v2` (or root)
   - Shortcut: `Alt+Shift+V`
   - Features: Full human-like Angular Material automation, 1:1 Nano Banana Pro, Veo 3.1 Fast, 30 character voices, smart combinatorics batching, and Antigravity AI Agent Bridge.

Both extensions have distinct manifest IDs, shortcuts, and in-page HUDs (`#cf-floating-hud` and `#cf-v2-floating-hud`), automatically adapting to sit side-by-side!

---

## 🚀 Quick Setup

### 1. Load the Chrome Extension(s)

1. Open **Google Chrome** (or Edge / Brave) and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select:
   - `c:\Users\pc\Desktop\Coding\connect-flow\extension-v2` (for V2 Beta)
   - `c:\Users\pc\Desktop\Coding\connect-flow\extension-v1` (for V1 Classic, optional)
4. Open [flow.google.com](https://flow.google.com) and log into your Google account.
5. The floating **Glacial HUD** will appear ready for action!

### 2. Connect Your AI Coding Agent (Antigravity, Cursor, Claude Code)

Add Connect Flow as an MCP server in your agent config (e.g. `~/.cursor/mcp.json`, `~/.claude/mcp.json`, or Antigravity settings):

```json
{
  "mcpServers": {
    "connect-flow": {
      "command": "connect-flow-mcp"
    }
  }
}
```

Or run the CLI directly:

```bash
# Check connection & Flow tab visibility
node cli/bin/connect-flow.mjs status

# Generate an image with Nano Banana Pro in 1:1 ratio
node cli/bin/connect-flow.mjs generate "A majestic arctic fox in cyber glacial city" --ratio 1:1

# Generate a video with Veo 3.1 Fast and Alloy voice
node cli/bin/connect-flow.mjs generate "A futuristic spaceship flying through icy rings" --mode video --model veo-3.1-fast --voice Alloy --duration 8s

# Run a combinatorial batch with variables
node cli/bin/connect-flow.mjs batch prompts.txt --vars "style=Cyberpunk,Watercolor" -c 2
```

---

## 🛠️ CLI Subcommands

| Command | Description |
|---|---|
| `connect-flow generate [prompt]` | Universal generation with mode, model, aspect ratio (1:1 default), duration, and voice |
| `connect-flow batch <file>` | Bulk generate prompts from a file or template with Smart Variables |
| `connect-flow image [prompt]` | Specialized text-to-image with `nano-banana-pro` |
| `connect-flow video [prompt]` | Specialized text-to-video with `veo-3.1-fast` or `omni-flash` |
| `connect-flow status` | Check local bridge daemon, extension health, and tab visibility |
| `connect-flow doctor` | Run comprehensive system, extension, and network diagnostic |
| `connect-flow bridge [start\|stop]` | Control the background WebSocket/HTTP bridge daemon |
| `connect-flow mcp` | Launch the stdio Model Context Protocol (MCP) server |

---

## 📜 License

MIT License. Crafted with precision for the Google Antigravity & AI Developer Community.
