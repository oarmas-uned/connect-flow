# Connect Flow CLI & Agent Bridge ⚡

> **Safe, real-time command-line interface & Model Context Protocol (MCP) bridge for Google Flow bulk image and video generation.**  
> Free & unlimited generation through your own logged-in Google Flow session without API costs.

---

## 🌟 What makes this CLI better for Agents & Humans?

1. **Simple, Clean File Names**:
   - **Automatic Slugification**: No more confusing random hashes or timestamp names! Prompts like `"A cinematic shot of an arctic fox in snow"` automatically save as `close-arctic-fox-snow.png`.
   - **Explicit `--output` / `-o`**: Specify exact paths like `-o ./assets/hero.png` or `-o intro.mp4`. The CLI automatically relocates the file and ensures destination folders exist.
   - **`--dir` option**: Easily direct all generations to your project folder instead of burying them deep in system download folders.

2. **Real-Time Step & Event Streaming**:
   - **Visual Terminal Streamer**: Colored step-by-step progress with elapsed seconds (`Connecting` ➔ `Session Active` ➔ `Submitting` ➔ `Generating` ➔ `Downloading` ➔ `Saved`).
   - **Agent-First NDJSON Streaming (`--stream`)**: Machine-readable newline-delimited JSON stream for coding agents to monitor progress line-by-line.
   - **Single Structured JSON (`--json`)**: Outputs clean structured JSON objects on completion with complete metadata (size, paths, model, duration).

3. **Safety & Google Account Protection**:
   - **Tab Visibility Guard**: Detects if your Google Flow browser tab is minimized or hidden in the background (which causes browser throttling and freezes generation). Warns immediately or pauses cleanly with `--wait-tab`.
   - **Anti-Burst Rate Limiter**: Enforces intelligent adaptive delays and jitter between automated requests, preventing account strikes or automated bot flags.
   - **Policy Pre-Flight**: Catches content policy refusals early and provides human-readable explanations instead of silent failures.

4. **Built-in Model Context Protocol (MCP) Server**:
   - Exposes standard stdio tools for Claude Code, Gemini CLI, Cursor, and Windsurf:
     - `flow_status`: Inspect connection, plan, and tab visibility.
     - `flow_generate_image`: Prompt, model, aspect ratio, clean output file.
     - `flow_generate_video`: Prompt, duration (4s, 6s, 8s, 10s), resolution, model, clean output file.

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

### 1. Generate an Image
```bash
# Automatic clean slug naming:
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

### 2. Generate a Video
```bash
# Generate 6-second video with Omni Flash:
connect-flow video "Camera pans over a frozen glacier lagoon" -o glacier.mp4

# Custom duration and 720p resolution:
connect-flow video "Drone flight through cybernetic Tokyo" -s 8 -r 720p -o intro.mp4

# Veo quality model:
connect-flow video "Liquid gold flowing over obsidian rock" -m veo-3.1-quality -o gold.mp4
```

### 3. Check Status
```bash
connect-flow status
# or with JSON:
connect-flow status --json
```

### 4. System Diagnostic (Doctor)
```bash
connect-flow doctor
```

### 5. Launch MCP Server
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

---

## 👤 Author
**Arafat Ahmed Mubin**  
Repository: [https://github.com/oarmas-uned/connect-flow.git](https://github.com/oarmas-uned/connect-flow.git)
