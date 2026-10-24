# Connect Flow CLI & Agent Bridge ⚡

> **Safe, real-time command-line interface & Model Context Protocol (MCP) bridge for Google Flow bulk image and video generation.**  
> Free & unlimited generation through your own logged-in Google Flow session without API costs.

---

## 🌟 What makes this CLI better for Agents & Humans?

1. **Total Control Over Modes, Models & Ratios**:
   - **Mode Flexibility**: Choose `image` (text-to-image, img2img) or `video` (text-to-video, frame-to-video).
   - **Model Support & Smart Normalization**: Pass clean IDs or natural language names:
     - **Image**: `Nano Banana Pro` (default, highest quality), `Nano Banana 2.1` / `Nano Banana 2`, `Nano Banana 2 Lite`.
     - **Video**: `Omni Flash 1.1` / `Omni Flash` (default), `Veo 3 Fast` / `Veo 3.1 Fast`, `Veo 3 Quality`, `Veo 3 Lite`.
   - **Default 1:1 Aspect Ratio**: Default ratio is `1:1` (square). Fully supports `1:1`, `16:9`, `9:16`, `4:3`, and `3:4` with aliases like `square`, `landscape`, `portrait`, `shorts`.

2. **Simple, Clean File Names**:
   - **Automatic Slugification**: No more confusing random hashes or timestamp names! Prompts like `"A cinematic shot of an arctic fox in snow"` automatically save as `close-arctic-fox-snow.png`.
   - **Explicit `--output` / `-o`**: Specify exact paths like `-o ./assets/hero.png` or `-o intro.mp4`. The CLI automatically relocates the file and ensures destination folders exist.
   - **`--dir` option**: Easily direct all generations to your project folder instead of burying them deep in system download folders.

3. **Real-Time Step & Event Streaming**:
   - **Visual Terminal Streamer**: Colored step-by-step progress with elapsed seconds (`Connecting` ➔ `Session Active` ➔ `Submitting` ➔ `Generating` ➔ `Downloading` ➔ `Saved`).
   - **Agent-First NDJSON Streaming (`--stream`)**: Machine-readable newline-delimited JSON stream for coding agents to monitor progress line-by-line.
   - **Single Structured JSON (`--json`)**: Outputs clean structured JSON objects on completion with complete metadata (size, paths, model, duration).

4. **Safety & Google Account Protection**:
   - **Tab Visibility Guard**: Detects if your Google Flow browser tab is minimized or hidden in the background (which causes browser throttling and freezes generation). Warns immediately or pauses cleanly with `--wait-tab`.
   - **Anti-Burst Rate Limiter**: Enforces intelligent adaptive delays and jitter between automated requests, preventing account strikes or automated bot flags.
   - **Policy Pre-Flight**: Catches content policy refusals early and provides human-readable explanations instead of silent failures.

5. **Universal Model Context Protocol (MCP) Suite**:
   - Exposes standard stdio tools for Claude Code, Gemini CLI, Cursor, and Windsurf:
     - `flow_generate`: Universal generator with complete control over `mode`, `prompt`, `model`, `aspect_ratio` (1:1 default), `duration`, `resolution`, and `output_file`.
     - `flow_generate_image`: Specialized image generator with Nano Banana Pro and 1:1 square default.
     - `flow_generate_video`: Specialized video generator with Omni Flash or Veo 3 Fast.
     - `flow_list_models`: Schema and metadata discovery tool for agents.
     - `flow_status`: Inspect connection, plan, and tab visibility.

---

## 🚀 Installation

```bash
# Link locally or install globally
npm install -g .
```

Verify installation:
```bash
connect-flow --version
```

---

## 💻 CLI Commands

### 1. Unified Generator (`connect-flow generate`)
```bash
# Default 1:1 square image with Nano Banana Pro:
connect-flow generate "Futuristic cybernetic core with glowing cyan circuits" -o core.png

# Image with Nano Banana 2.1 in widescreen 16:9:
connect-flow generate "Panorama of an ice canyon at twilight" --model "Nano Banana 2.1" -a 16:9 -o canyon.png

# Video with Omni Flash 1.1:
connect-flow generate "Camera orbits a levitating crystal sphere" --mode video --model "Omni Flash 1.1" -o sphere.mp4

# Cinematic 8s video with Veo 3 Fast in 9:16 vertical shorts:
connect-flow generate "Model walking down a rainy neon Tokyo alley" --mode video --model "Veo 3 Fast" -a 9:16 -s 8 -o tokyo.mp4
```

### 2. Generate an Image (`connect-flow image`)
```bash
# Automatic clean slug naming (default 1:1):
connect-flow image "Cyberpunk street with glowing neon signs"

# Explicit output filename:
connect-flow image "Futuristic glass building in winter" -o ./assets/hero.png

# Custom aspect ratio & model:
connect-flow image "Macro photography of an ice crystal" -a 1:1 -m nano-banana-pro -o icon.png

# Stream events in real time for AI coding agents:
connect-flow image "Portrait of an astronaut" --stream

# Structured machine JSON output:
connect-flow image "Abstract gradient background" --json
```

### 3. Generate a Video (`connect-flow video`)
```bash
# Generate 6-second video with Omni Flash:
connect-flow video "Camera pans over a frozen glacier lagoon" -o glacier.mp4

# Custom duration and 720p resolution:
connect-flow video "Drone flight through cybernetic Tokyo" -s 8 -r 720p -o intro.mp4

# Veo quality model:
connect-flow video "Liquid gold flowing over obsidian rock" -m "Veo 3 Quality" -o gold.mp4
```

### 4. Check Status
```bash
connect-flow status
# or with JSON:
connect-flow status --json
```

### 5. System Diagnostic (Doctor)
```bash
connect-flow doctor
```

### 6. Launch MCP Server
```bash
connect-flow mcp
```

---

## 🤖 MCP Configuration for AI Coding Agents

Add to your user-level MCP configuration (e.g. `~/.cursor/mcp.json`, `~/.claude/mcp.json`, `~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "connect-flow": {
      "command": "connect-flow-mcp"
    }
  }
}
```

Agents can then invoke:
- `flow_generate({ prompt: "Glowing cyan loop icon", mode: "image", model: "Nano Banana Pro", aspect_ratio: "1:1", output_file: "icon.png" })`
- `flow_generate({ prompt: "Drone flight through cyber canyon", mode: "video", model: "Veo 3 Fast", duration: "8", resolution: "720p", output_file: "intro.mp4" })`

---

## 👤 Author
**Arafat Ahmed Mubin**  
Repository: [https://github.com/oarmas-uned/connect-flow.git](https://github.com/oarmas-uned/connect-flow.git)
