# Connect Flow ❄️⚡

[![Version](https://img.shields.io/badge/version-1.3.1-00d2ff.svg)](https://github.com/oarmas-uned/connect-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![UI: Pale Glacier Blue](https://img.shields.io/badge/UI-Pale%20Glacier%20Blue-7dd3fc.svg)](https://flow.google.com)
[![Ratio: 1:1 Default](https://img.shields.io/badge/Ratio-1%3A1%20Default-00e5ff.svg)](https://flow.google.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![MCP Server](https://img.shields.io/badge/MCP-Supported-purple.svg)](https://modelcontextprotocol.io/)

> **Connect Flow** brings free, unlimited image and video generation on [Google Flow](https://flow.google.com) directly to your terminal, local scripts, and AI coding agents (Claude Code, Gemini CLI, Cursor, Windsurf) — using your own logged-in session with **zero API costs**.

---

## 🌟 Highlights

### 🎨 Pale Glacier Blue & Cyber Flow Design System
- **1:1 Cyber Flow Loop Icon Suite**: Approved square cyber flow loop icon with fluid electric cyan energy streams and deep glacial tones in 16px, 32px, 48px, and 128px formats.
- **In-Page Glacial Floating HUD**: Sleek frosted glass HUD on `flow.google.com` featuring live Agent Bridge telemetry (port 8791), quick batch sender, direct tile downloader, and Direct Mode enforcement.
- **Dual Anti-Throttling Keep-Awake Engine**: Background WebRTC self-loop and silent AudioContext prevent Chrome from throttling or sleeping background Flow tabs, ensuring full generation speed even when minimized.

### ⚡ Bulk Batching & Smart Variables (Combinatorial Engine)
- **Combinatorial Multiplier**: Use `[variable]` or `{variable}` in prompt templates with value lists to automatically multiply and generate all combinations (e.g. 5 prompts x 4 styles = 20 unique outputs).
- **Multi-Variation Control**: Generate 1 to 4 outputs per prompt (`-c, --count 1..4`).
- **Template Naming Engine**: Customizable naming formats with `{prefix}`, `{row}`, `{prompt}`, `{slot}`, `{model}`, `{date}`, `{timestamp}` placeholders and zero-padding (`01`, `001`).

### 🎭 Character Mentions & Voice Performances
- **30 Flow Character Voices**: Full mapping of Google Flow Character Voice Performances (Achernar, Charon, Kore, Orus, Zephyr, etc.).
- **@mention Character Linking**: Auto-detects `@character_name` in prompts and attaches Google Flow entity references.

### 🤖 Total Control for AI Agents & CLI
- **Mode Control**: Effortlessly switch between `image` (text-to-image, image-to-image) and `video` (text-to-video, frame-to-video, start/end frames).
- **Comprehensive Model Support**:
  - **Image**: `Nano Banana Pro` (default, highest fidelity), `Nano Banana 2.1` / `Nano Banana 2`, `Nano Banana 2 Lite`.
  - **Video**: `Omni Flash 1.1` / `Omni Flash` (default), `Veo 3 Fast` / `Veo 3.1 Fast`, `Veo 3 Quality`, `Veo 3 Lite`.
  - Natural language aliases are automatically normalized (e.g. agents can pass `"Veo 3 Fast"` or `"Nano Banana 2.1"` directly).
- **Aspect Ratio Control (1:1 Default)**: Default ratio is **1:1** (square). Full support for `1:1`, `16:9` (landscape), `9:16` (shorts / reels), `4:3`, and `3:4` with smart alias resolution (`square`, `landscape`, `portrait`, `shorts`).
- **Video Duration & Resolution**: Choose 4s, 6s (default), 8s, or 10s at 720p or 360p.

### 🔓 100% Free & Unrestricted
- **No Licensing or Subscription Gates**: All generation throttles, artificial batch size restrictions, and cooldowns unlocked.
- **Direct Google Flow Automation**: Drives your authenticated browser session in real time.

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

### 🤖 Native MCP (Model Context Protocol) Suite
- Built-in stdio server (`connect-flow mcp`) providing:
  - `flow_generate`: Universal master tool with mode, model, aspect ratio (1:1 default), duration, resolution, naming templates, start/end frames, and voice performances.
  - `flow_batch_generate`: Multi-prompt / combinatorial batch runner for AI agents.
  - `flow_expand_prompts`: Preview variable expansions without running generation.
  - `flow_generate_image`: Specialized image generator with Nano Banana Pro and 1:1 ratio.
  - `flow_generate_video`: Specialized video generator with Omni Flash or Veo 3 Fast.
  - `flow_list_models`: Live capability, 30 character voices, naming templates, and model schema discovery for agents.
  - `flow_status`: Real-time health, tab visibility, and account plan check.
  - `flow_list_models`: Live capability and model schema discovery for agents.
  - `flow_status`: Real-time health, tab visibility, and account plan check.

---

## 📦 Project Structure

```
connect-flow/
├── manifest.json              # Chrome extension manifest (v1.3.1, MV3)
├── assets/                    # Pale Glacier Blue UI & content injection scripts
├── icons/                     # 1:1 Cyber Flow Loop icon suite (16, 32, 48, 128)
├── src/sidepanel/             # Extension side panel UI
├── cli/                       # Standalone safe & real-time CLI + MCP bridge
│   ├── bin/
│   │   ├── connect-flow.mjs   # Main CLI executable
│   │   └── connect-flow-mcp.mjs # Stdio MCP server
│   ├── src/
│   │   ├── cli.mjs            # Commander subcommands (generate, image, video, status, doctor)
│   │   ├── bridge-client.mjs  # HTTP client & real-time job execution
│   │   ├── bridge-server.mjs  # Built-in background daemon
│   │   ├── constants.mjs      # Models, ratios, and smart alias normalizers
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

### 1. Bulk Batch Generator with Smart Variables (`connect-flow batch`)
```bash
# Run a batch from a text file (one prompt per line):
connect-flow batch prompts.txt

# Combinatorial expansion with Smart Variables:
connect-flow batch "A futuristic [color] [vehicle] in rain" --vars '{"color":["cyan","amber"],"vehicle":["car","bike"]}'

# Preview expanded prompts without executing:
connect-flow batch "Cyberpunk scene with [lighting]" --vars '{"lighting":["neon","twilight","golden hour"]}' --dry-run

# Batch with 2 variations per prompt & naming template:
connect-flow batch prompts.txt -c 2 --naming-template "{prefix}{row}_{prompt}_{slot}" --prefix "hero_"

# Batch of 6s videos:
connect-flow batch video-prompts.txt -m video --model "Veo 3 Fast" -a 16:9 -s 6
```

### 2. Unified Generator (`connect-flow generate`)
```bash
# Generate 1:1 square image with Nano Banana Pro (default):
connect-flow generate "Futuristic cybernetic core with glowing blue circuits" -o core.png

# Generate image with Nano Banana 2.1 in 16:9 ratio:
connect-flow generate "Panorama of an ice canyon at twilight" --model "Nano Banana 2.1" -a 16:9 -o canyon.png

# Generate 6s video with Omni Flash 1.1:
connect-flow generate "Camera orbits a levitating crystal sphere" --mode video --model "Omni Flash 1.1" -o sphere.mp4

# Generate 8s cinematic video with Veo 3 Fast in 9:16 vertical format:
connect-flow generate "Model walking down a rainy neon Tokyo alley" --mode video --model "Veo 3 Fast" -a 9:16 -s 8 -o tokyo-shorts.mp4
```

### 2. Generate an Image (`connect-flow image`)
```bash
# Default 1:1 aspect ratio with automatic clean slug filename:
connect-flow image "An arctic fox standing on frosted ice at sunset"

# Explicit output file:
connect-flow image "Futuristic architectural museum with glass domes" -o ./hero.png

# Custom aspect ratio & model:
connect-flow image "Macro crystalline structure" -a 16:9 -m nano-banana-pro -o icon.png

# Stream real-time events for coding agents:
connect-flow image "Cyberpunk street in rain" --stream

# Output single structured JSON:
connect-flow image "Minimalist wallpaper" --json
```

### 3. Generate a Video (`connect-flow video`)
```bash
# Generate 6s video with Omni Flash:
connect-flow video "Drone tracking shot over glacial mountains" -o glacier.mp4

# Custom duration and 720p resolution:
connect-flow video "Camera dolly through neon city" -s 8 -r 720p -o intro.mp4

# High-fidelity Veo model:
connect-flow video "Molten metal pouring over dark stones" -m "Veo 3 Quality" -o metal.mp4
```

### 4. Health & Diagnostics
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

Now you can instruct your agent directly:
> *"Generate a 1:1 square app logo with Nano Banana Pro showing a glowing cyan ribbon loop on a dark glass background, saved to ./icons/app-logo.png"*

The agent calls `flow_generate` with mode `"image"`, model `"Nano Banana Pro"`, ratio `"1:1"`, and output `"./icons/app-logo.png"`.

---

## 📄 License

MIT License. See [LICENSE.txt](LICENSE.txt) for details.

---

## 👤 Author & Credits

Created by **Arafat Ahmed Mubin**  
GitHub: [https://github.com/oarmas-uned/connect-flow.git](https://github.com/oarmas-uned/connect-flow.git)
