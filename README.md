# Connect Flow ❄️⚡

[![Version](https://img.shields.io/badge/version-1.3.0-00d2ff.svg)](https://github.com/oarmas-uned/connect-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![UI: Pale Glacier Blue](https://img.shields.io/badge/UI-Pale%20Glacier%20Blue-7dd3fc.svg)](https://www.igloo.inc/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![MCP Server](https://img.shields.io/badge/MCP-Supported-purple.svg)](https://modelcontextprotocol.io/)

> **Connect Flow** brings free, unlimited image and video generation on [Google Flow](https://flow.google.com) directly to your terminal, local scripts, and AI coding agents (Claude Code, Gemini CLI, Cursor, Windsurf) — using your own logged-in session with **zero API costs**.

---

## 🌟 Highlights

### 🎨 Pale Glacier Blue Design System
- **Award-Winning Igloo Aesthetics**: Inspired by [igloo.inc](https://www.igloo.inc/), styled with crystalline frosted glass, drifting glacial snow particles, deep contrast arctic shadows, and a levitating cryo core orb.
- **3D Frosted Icon Suite**: Custom 3D rendered frosted glass igloo with orbiting cyan ribbons in 16px, 32px, 48px, and 128px formats.

### 🔓 100% Free & Unrestricted
- **No Licensing or Subscription Gates**: All generation throttles, artificial batch size restrictions, and cooldowns unlocked.
- **Bulk Batching**: Fire prompt batches with full freedom.

### 🛡️ Safer CLI with Tab-Visibility Guard & Anti-Burst Protection
- **Tab-Visibility Guard**: Automatically detects if your `flow.google.com` tab is minimized or covered. Google throttles background tabs — the CLI immediately alerts you or waits until active (`--wait-tab`) instead of freezing.
- **Anti-Burst Rate Limiter**: Automatically paces automated requests with adaptive jitter (2–5s) to protect your personal Google account from bot-detection flags.
- **Policy Pre-Flight**: Catches content policy refusals early with clear human explanations.

### ⏱️ Real-Time Step Progress & Event Streaming
- **Visual Terminal Streamer**: Step-by-step progress with elapsed time counters (`Connecting` ➔ `Session Verified` ➔ `Submitting` ➔ `Rendering` ➔ `Downloading` ➔ `Saved`).
- **Machine-Readable NDJSON Streaming (`--stream`)**: Emits structured JSONL events in real time so AI coding agents can monitor progress interactively.

### 📁 Simple & Clean File Names
- **Smart Automatic Slugification**: No more cryptic timestamp or hash filenames (`flow-auto_1729782928.png`)! Prompts automatically save as clean, descriptive slugs like `close-arctic-fox-snow.png`.
- **Explicit Output Paths (`-o, --output`)**: Save directly to your desired filename or folder (`-o ./assets/hero.png` or `-o intro.mp4`).

### 🤖 Native MCP (Model Context Protocol) Server
- Built-in stdio server (`connect-flow mcp`) providing `flow_status`, `flow_generate_image`, and `flow_generate_video` to any modern coding agent.

---

## 📦 Project Structure

```
connect-flow/
├── manifest.json              # Chrome extension manifest (v1.3.0, MV3)
├── assets/                    # Pale Glacier Blue UI & content injection scripts
├── icons/                     # 3D frosted igloo icon suite (16, 32, 48, 128)
├── src/sidepanel/             # Extension side panel UI
├── cli/                       # Standalone safe & real-time CLI + MCP bridge
│   ├── bin/
│   │   ├── connect-flow.mjs   # Main CLI executable
│   │   └── connect-flow-mcp.mjs # Stdio MCP server
│   ├── src/
│   │   ├── cli.mjs            # Commander subcommands
│   │   ├── bridge-client.mjs  # HTTP client & real-time job execution
│   │   ├── bridge-server.mjs  # Built-in background daemon
│   │   ├── namer.mjs          # Slug generator & file relocator
│   │   ├── safety.mjs         # Tab health & anti-burst limiter
│   │   └── streamer.mjs       # Real-time NDJSON & visual streamer
│   └── package.json
└── README.md
```

---

## 🚀 Getting Started

### Step 1: Install the Chrome Extension

1. Open **Google Chrome** (or Edge / Brave) and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the root directory of this repository (`connect-flow`).
4. Pin the **Connect Flow** extension in your browser bar.
5. Open [flow.google.com](https://flow.google.com) and log into your Google account. Keep this tab open while generating.

### Step 2: Install the CLI

Ensure you have **Node.js 20 or newer** installed (`node --version`).

```bash
# Clone the repository
git clone https://github.com/oarmas-uned/connect-flow.git
cd connect-flow

# Install dependencies and link globally
npm install
npm link ./cli
```

Verify the CLI is ready:
```bash
connect-flow --version
connect-flow doctor
```

---

## 💻 CLI Usage Guide

### Generate an Image
```bash
# Automatic clean filename:
connect-flow image "An arctic fox standing on frosted ice at sunset"

# Explicit output file:
connect-flow image "Futuristic architectural museum with glass domes" -o ./hero.png

# Custom aspect ratio & model:
connect-flow image "Macro crystalline structure" -a 1:1 -m nano-banana-pro -o icon.png

# Stream real-time events for coding agents:
connect-flow image "Cyberpunk street in rain" --stream

# Output single structured JSON:
connect-flow image "Minimalist wallpaper" --json
```

### Generate a Video
```bash
# Generate 6s video (Omni Flash):
connect-flow video "Drone tracking shot over glacial mountains" -o glacier.mp4

# Custom duration and 720p resolution:
connect-flow video "Camera dolly through neon city" -s 8 -r 720p -o intro.mp4

# High-fidelity Veo model:
connect-flow video "Molten metal pouring over dark stones" -m veo-3.1-quality -o metal.mp4
```

### Health & Diagnostics
```bash
# Check connection & Flow tab visibility:
connect-flow status

# Output status as JSON:
connect-flow status --json

# Run complete environment diagnostic:
connect-flow doctor
```

---

## 🤖 Coding Agent Integration (MCP)

To enable your coding agents to generate assets directly:

### Cursor / Windsurf / Claude Code / Gemini CLI
Add this entry to your user MCP configuration (e.g., `~/.cursor/mcp.json`, `~/.claude/mcp.json`, or `~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "connect-flow": {
      "command": "connect-flow-mcp"
    }
  }
}
```

Now you can ask your agent:
> *"Generate a 16:9 hero banner showing a serene mountain lake at sunrise, and save it to ./assets/hero.png"*

The agent will invoke `flow_generate_image` and place the file right into your project.

---

## 📄 License

MIT License. See [LICENSE.txt](LICENSE.txt) for details.

---

## 👤 Author & Credits

Created by **Arafat Ahmed Mubin**  
GitHub: [https://github.com/oarmas-uned/connect-flow.git](https://github.com/oarmas-uned/connect-flow.git)
