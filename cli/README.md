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

2. **Bulk Batching & Smart Variables (Combinatorial Engine)**:
   - **Cartesian Multiplier**: Use `[variable]` or `{variable}` in prompt templates to automatically generate full combinatorial variations (e.g. 5 prompts x 4 styles = 20 unique outputs).
   - **Batch Command & Tool**: Generate entire batches via `connect-flow batch <file>` or MCP tool `flow_batch_generate`.
   - **Multi-Variation Generation**: Generate 1 to 4 outputs per prompt (`-c, --count 1..4`).

3. **Advanced Naming Templates**:
   - Customize output naming with placeholders: `{prefix}`, `{row}`, `{prompt}`, `{slot}`, `{model}`, `{date}`, `{timestamp}`.
   - Example: `--naming-template "{prefix}{row}_{prompt}_{slot}" --prefix "hero_"` -> `hero_01_cyber-fox_s1.png`.
   - **Automatic Slugification**: No more confusing random hashes! Prompts automatically save as clean, descriptive slugs.
   - **Explicit `--output` / `-o`**: Specify exact paths like `-o ./assets/hero.png` or `-o intro.mp4`.

4. **Character Mentions & Character Voices**:
   - **30 Character Voice Performances**: Map voices like `Achernar`, `Charon`, `Kore`, `Orus`, `Zephyr`, with custom voice styles.
   - **@mention Character Linking**: Prompts containing `@character_name` automatically link character reference entities.

5. **Real-Time Step & Event Streaming**:
   - **Visual Terminal Streamer**: Colored step-by-step progress with elapsed seconds (`Connecting` ➔ `Session Active` ➔ `Submitting` ➔ `Generating` ➔ `Downloading` ➔ `Saved`).
   - **Agent-First NDJSON Streaming (`--stream`)**: Machine-readable newline-delimited JSON stream for coding agents to monitor progress line-by-line.
   - **Single Structured JSON (`--json`)**: Outputs clean structured JSON objects on completion with complete metadata (size, paths, model, duration).

6. **Safety & Google Account Protection**:
   - **Dual Keep-Awake Protection**: In-browser WebRTC loop + Silent AudioContext keep Flow generating at 100% speed even when minimized or backgrounded!
   - **Tab Visibility Guard**: Detects if your Google Flow browser tab is minimized or hidden. Warns immediately or pauses cleanly with `--wait-tab`.
   - **Anti-Burst Rate Limiter**: Enforces intelligent adaptive delays and jitter between automated requests, preventing account strikes or automated bot flags.
   - **Policy Pre-Flight**: Catches content policy refusals early and provides human-readable explanations.

7. **Universal Model Context Protocol (MCP) Suite**:
   - Exposes standard stdio tools for Claude Code, Gemini CLI, Cursor, and Windsurf:
     - `flow_generate`: Universal generator with control over mode, prompt, model, ratio, duration, resolution, naming templates, start/end frames, and voices.
     - `flow_batch_generate`: Multi-prompt / combinatorial batch runner for agents.
     - `flow_expand_prompts`: Preview variable expansions without running generation.
     - `flow_list_models`: Schema discovery tool returning all models, ratios, 30 character voices, and naming templates.
     - `flow_generate_image` / `flow_generate_video`: Specialized tools for single media.
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

### 1. Bulk Batch Generator (`connect-flow batch`)
```bash
# Run a batch from a text file (one prompt per line):
connect-flow batch prompts.txt

# Combinatorial expansion with Smart Variables:
connect-flow batch "A futuristic [color] [vehicle] in rain" --vars '{"color":["cyan","amber"],"vehicle":["car","bike"]}'

# Dry-run preview without executing:
connect-flow batch "Cyberpunk scene with [lighting]" --vars '{"lighting":["neon","twilight","golden hour"]}' --dry-run

# Batch with 2 outputs per prompt and naming template:
connect-flow batch prompts.txt -c 2 --naming-template "{prefix}{row}_{prompt}_{slot}" --prefix "hero_"

# Batch of 6s videos:
connect-flow batch video-prompts.txt -m video --model "Veo 3 Fast" -a 16:9 -s 6
```

### 2. Unified Generator (`connect-flow generate`)
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
