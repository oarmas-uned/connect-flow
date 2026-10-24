import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { BridgeClient } from "./bridge-client.mjs";
import { BridgeServer } from "./bridge-server.mjs";
import { Streamer } from "./streamer.mjs";
import { runMcpServer } from "./mcp-server.mjs";
import { CombinatoricsEngine } from "./combinatorics.mjs";
import {
  ASPECT_RATIOS,
  BRIDGE_DEFAULT_PORT,
  BRIDGE_VERSION,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROJECT_URL,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  normalizeAspectRatio,
  normalizeMode,
  normalizeModel
} from "./constants.mjs";

const __filename = fileURLToPath(import.meta.url);
const binPath = path.resolve(path.dirname(__filename), "../bin/connect-flow.mjs");

export function createCli() {
  const program = new Command();

  program
    .name("connect-flow")
    .description("Safe, real-time CLI & Agent MCP bridge for Google Flow generation")
    .version(BRIDGE_VERSION)
    .option("--port <port>", "bridge daemon port", String(BRIDGE_DEFAULT_PORT));

  function getClient(portArg) {
    const port = Number(portArg || program.opts().port || BRIDGE_DEFAULT_PORT);
    return new BridgeClient({
      port,
      daemonArgs: [binPath, "bridge", "start"]
    });
  }

  // --- Subcommand: generate (Unified for AI agents & CLI) ---
  program
    .command("generate [prompt]")
    .description("Universal generator for Google Flow (images or videos with model & ratio control)")
    .option("-p, --prompt <text>", "prompt text")
    .option("-m, --mode <mode>", "mode: image or video", "image")
    .option("--model <model>", "model (e.g. Nano Banana Pro, Nano Banana 2.1, Veo 3 Fast, Omni Flash)")
    .option("-a, --aspect-ratio <ratio>", `aspect ratio (${ASPECT_RATIOS.join(", ")})`, DEFAULT_ASPECT_RATIO)
    .option("-s, --duration <seconds>", `video duration (${VIDEO_DURATIONS.join(", ")})`, DEFAULT_VIDEO_DURATION)
    .option("-r, --resolution <res>", `video resolution (${VIDEO_RESOLUTIONS.join(", ")})`, "720p")
    .option("-c, --count <number>", "variations per prompt (1 to 4)", "1")
    .option("--naming-template <pattern>", "naming pattern (e.g. '{prefix}{row}_{prompt}_{slot}')")
    .option("--prefix <text>", "prefix for output files", "")
    .option("--start-frame <path>", "start frame image path (video)")
    .option("--end-frame <path>", "end frame image path (video)")
    .option("--voice-name <name>", "character voice name (e.g. 'Achernar', 'Zephyr')")
    .option("--voice-style <text>", "character voice style / performance instruction")
    .option("-o, --output <path>", "custom output path or filename")
    .option("--project <url-or-id>", "Google Flow project URL or ID", DEFAULT_PROJECT_URL)
    .option("-d, --dir <folder>", "output directory", process.cwd())
    .option("-i, --image <files...>", "reference input image(s)")
    .option("--wait-tab", "pause and wait automatically if Flow tab is hidden", false)
    .option("--stream", "stream real-time NDJSON events for agents", false)
    .option("--json", "output single structured JSON on completion", false)
    .action(async (promptArg, opts) => {
      const prompt = promptArg || opts.prompt;
      if (!prompt) {
        console.error("\x1b[31mError:\x1b[0m Missing prompt. Provide as argument or with --prompt <text>");
        process.exit(1);
      }

      const streamMode = opts.stream ? "stream" : opts.json ? "json" : "human";
      const streamer = new Streamer({ mode: streamMode });
      const client = getClient();

      try {
        const isVideo = (opts.mode || "").includes("vid") || (opts.mode || "").includes("movie");
        const resolvedModel = normalizeModel(opts.model, isVideo);
        const resolvedRatio = normalizeAspectRatio(opts.aspectRatio);

        const result = await client.executeJob({
          mode: opts.mode || (isVideo ? "video" : "image"),
          prompt,
          model: resolvedModel,
          project: opts.project,
          aspectRatio: resolvedRatio,
          duration: opts.duration,
          resolution: opts.resolution,
          outputsPerPrompt: Number(opts.count) || 1,
          startFrame: opts.startFrame || null,
          endFrame: opts.endFrame || null,
          voiceName: opts.voiceName || null,
          voiceStyle: opts.voiceStyle || null,
          namingPattern: opts.namingTemplate,
          prefix: opts.prefix,
          output: opts.output,
          dir: opts.dir,
          imagePaths: opts.image || [],
          autoWaitTab: opts.waitTab,
          streamer
        });

        if (opts.json) {
          streamer.outputJson(result);
        }
      } catch (err) {
        streamer.emit("error", { message: err.message });
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
        }
        process.exit(1);
      }
    });

  // --- Subcommand: batch (Bulk Generator with Smart Variables) ---
  program
    .command("batch <source>")
    .description("Bulk generate images or videos from a file (.txt, .json) or template with Smart Variables")
    .option("-m, --mode <mode>", "mode: image or video", "image")
    .option("--model <model>", "model (Nano Banana Pro, Nano Banana 2.1, Veo 3 Fast, Omni Flash)")
    .option("-a, --aspect-ratio <ratio>", `aspect ratio (${ASPECT_RATIOS.join(", ")})`, DEFAULT_ASPECT_RATIO)
    .option("-s, --duration <seconds>", `video duration (${VIDEO_DURATIONS.join(", ")})`, DEFAULT_VIDEO_DURATION)
    .option("-c, --count <number>", "variations per prompt (1 to 4)", "1")
    .option("--vars <json>", "JSON string of variables for combinatorial expansion")
    .option("--vars-file <path>", "path to JSON file containing variables map")
    .option("--naming-template <pattern>", "naming pattern (e.g. '{prefix}{row}_{prompt}_{slot}')", "{prefix}{row}_{prompt}_{slot}")
    .option("--prefix <text>", "prefix for output files", "")
    .option("--delay <seconds>", "delay in seconds between generations (anti-burst)", "3")
    .option("-d, --dir <folder>", "output directory", process.cwd())
    .option("--project <url-or-id>", "Google Flow project URL or ID", DEFAULT_PROJECT_URL)
    .option("--dry-run", "preview expanded prompts without executing", false)
    .option("--wait-tab", "pause and wait automatically if Flow tab is hidden", false)
    .option("--stream", "stream real-time NDJSON events for agents", false)
    .option("--json", "output single structured JSON on completion", false)
    .action(async (source, opts) => {
      const streamMode = opts.stream ? "stream" : opts.json ? "json" : "human";
      const streamer = new Streamer({ mode: streamMode });
      const client = getClient();

      try {
        // 1. Resolve raw prompts
        let rawPrompts = [];
        const sourcePath = path.resolve(process.cwd(), source);

        if (fs.existsSync(sourcePath)) {
          const content = fs.readFileSync(sourcePath, "utf-8").trim();
          if (source.endsWith(".json")) {
            const parsed = JSON.parse(content);
            rawPrompts = Array.isArray(parsed) ? parsed : [parsed];
          } else {
            // Text file, one prompt per line
            rawPrompts = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
          }
        } else {
          // Direct prompt template string
          rawPrompts = [source];
        }

        if (rawPrompts.length === 0) {
          throw new Error("No prompts found in the specified source.");
        }

        // 2. Resolve variables
        let variables = {};
        if (opts.vars) {
          variables = JSON.parse(opts.vars);
        } else if (opts.varsFile) {
          const varsPath = path.resolve(process.cwd(), opts.varsFile);
          variables = JSON.parse(fs.readFileSync(varsPath, "utf-8"));
        }

        // 3. Expand prompts combinatorially
        const expandedItems = CombinatoricsEngine.expandBatch(rawPrompts, variables);
        if (expandedItems.length === 0) {
          throw new Error("Prompt expansion produced 0 valid prompts.");
        }

        if (opts.dryRun) {
          console.log(`\n\x1b[36m=== Connect Flow Batch Preview (${expandedItems.length} prompts) ===\x1b[0m`);
          expandedItems.forEach((item, idx) => {
            console.log(`\x1b[90m${String(idx + 1).padStart(3, " ")}.\x1b[0m ${item.prompt}`);
          });
          console.log(`\nMode: ${opts.mode} | Model: ${opts.model || "default"} | Ratio: ${opts.aspectRatio} | Outputs/prompt: x${opts.count}`);
          return;
        }

        // 4. Construct Job Configurations
        const isVideo = (opts.mode || "").includes("vid") || (opts.mode || "").includes("movie");
        const resolvedModel = normalizeModel(opts.model, isVideo);
        const resolvedRatio = normalizeAspectRatio(opts.aspectRatio);

        const jobs = expandedItems.map((item, idx) => ({
          prompt: item.prompt,
          mode: opts.mode || (isVideo ? "video" : "image"),
          model: resolvedModel,
          aspectRatio: resolvedRatio,
          duration: opts.duration,
          outputsPerPrompt: Math.max(1, Math.min(4, Number(opts.count) || 1)),
          namingPattern: opts.namingTemplate,
          prefix: opts.prefix,
          row: idx + 1,
          dir: opts.dir,
          project: opts.project
        }));

        // 5. Execute Batch
        const batchResult = await client.executeBatch({
          jobs,
          delaySec: Number(opts.delay) || 3,
          autoWaitTab: opts.waitTab,
          streamer
        });

        if (opts.json) {
          streamer.outputJson(batchResult);
        }
      } catch (err) {
        streamer.emit("error", { message: err.message });
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
        }
        process.exit(1);
      }
    });

  // --- Subcommand: image ---
  program
    .command("image [prompt]")
    .description("Generate an image with Google Flow (nano-banana-pro)")
    .option("-p, --prompt <text>", "prompt text")
    .option("-o, --output <path>", "custom output path or filename (e.g. hero.png)")
    .option("-a, --aspect-ratio <ratio>", `aspect ratio (${ASPECT_RATIOS.join(", ")})`, DEFAULT_ASPECT_RATIO)
    .option("-m, --model <model>", `image model (${IMAGE_MODELS.join(", ")})`, DEFAULT_IMAGE_MODEL)
    .option("-c, --count <number>", "variations per prompt (1 to 4)", "1")
    .option("--naming-template <pattern>", "naming pattern (e.g. '{prefix}{row}_{prompt}_{slot}')")
    .option("--prefix <text>", "prefix for output files", "")
    .option("--project <url-or-id>", "Google Flow project URL or ID", DEFAULT_PROJECT_URL)
    .option("-d, --dir <folder>", "output directory", process.cwd())
    .option("-i, --image <files...>", "reference input image(s)")
    .option("--wait-tab", "pause and wait automatically if Flow tab is hidden", false)
    .option("--stream", "stream real-time NDJSON events for agents", false)
    .option("--json", "output single structured JSON on completion", false)
    .action(async (promptArg, opts) => {
      const prompt = promptArg || opts.prompt;
      if (!prompt) {
        console.error("\x1b[31mError:\x1b[0m Missing prompt. Provide as argument or with --prompt <text>");
        process.exit(1);
      }

      const streamMode = opts.stream ? "stream" : opts.json ? "json" : "human";
      const streamer = new Streamer({ mode: streamMode });
      const client = getClient();

      try {
        const result = await client.executeJob({
          mode: opts.image?.length ? "flow-image-to-image" : "flow-text-to-image",
          prompt,
          model: opts.model,
          project: opts.project,
          aspectRatio: opts.aspectRatio,
          outputsPerPrompt: Number(opts.count) || 1,
          namingPattern: opts.namingTemplate,
          prefix: opts.prefix,
          output: opts.output,
          dir: opts.dir,
          imagePaths: opts.image || [],
          autoWaitTab: opts.waitTab,
          streamer
        });

        if (opts.json) {
          streamer.outputJson(result);
        }
      } catch (err) {
        streamer.emit("error", { message: err.message });
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
        }
        process.exit(1);
      }
    });

  // --- Subcommand: video ---
  program
    .command("video [prompt]")
    .description("Generate a video with Google Flow (Omni Flash / Veo)")
    .option("-p, --prompt <text>", "prompt text")
    .option("-o, --output <path>", "custom output path or filename (e.g. intro.mp4)")
    .option("-s, --duration <seconds>", `video duration (${VIDEO_DURATIONS.join(", ")})`, DEFAULT_VIDEO_DURATION)
    .option("-r, --resolution <res>", `video resolution (${VIDEO_RESOLUTIONS.join(", ")})`, "720p")
    .option("-m, --model <model>", `video model (${VIDEO_MODELS.join(", ")})`, DEFAULT_VIDEO_MODEL)
    .option("-c, --count <number>", "variations per prompt (1 to 4)", "1")
    .option("--start-frame <path>", "start frame image path")
    .option("--end-frame <path>", "end frame image path")
    .option("--voice-name <name>", "character voice name (e.g. 'Achernar', 'Zephyr')")
    .option("--voice-style <text>", "character voice style / performance instruction")
    .option("--naming-template <pattern>", "naming pattern (e.g. '{prefix}{row}_{prompt}_{slot}')")
    .option("--prefix <text>", "prefix for output files", "")
    .option("--project <url-or-id>", "Google Flow project URL or ID", DEFAULT_PROJECT_URL)
    .option("-d, --dir <folder>", "output directory", process.cwd())
    .option("-i, --image <files...>", "start/end frame or reference image(s)")
    .option("--wait-tab", "pause and wait automatically if Flow tab is hidden", false)
    .option("--stream", "stream real-time NDJSON events for agents", false)
    .option("--json", "output single structured JSON on completion", false)
    .action(async (promptArg, opts) => {
      const prompt = promptArg || opts.prompt;
      if (!prompt) {
        console.error("\x1b[31mError:\x1b[0m Missing prompt. Provide as argument or with --prompt <text>");
        process.exit(1);
      }

      const streamMode = opts.stream ? "stream" : opts.json ? "json" : "human";
      const streamer = new Streamer({ mode: streamMode });
      const client = getClient();

      try {
        const hasFrames = !!opts.startFrame || !!opts.endFrame || opts.image?.length > 0;
        const result = await client.executeJob({
          mode: hasFrames ? "flow-frame-to-video" : "flow-text-to-video",
          prompt,
          model: opts.model,
          project: opts.project,
          duration: opts.duration,
          resolution: opts.resolution,
          outputsPerPrompt: Number(opts.count) || 1,
          startFrame: opts.startFrame || null,
          endFrame: opts.endFrame || null,
          voiceName: opts.voiceName || null,
          voiceStyle: opts.voiceStyle || null,
          namingPattern: opts.namingTemplate,
          prefix: opts.prefix,
          output: opts.output,
          dir: opts.dir,
          imagePaths: opts.image || [],
          autoWaitTab: opts.waitTab,
          streamer
        });

        if (opts.json) {
          streamer.outputJson(result);
        }
      } catch (err) {
        streamer.emit("error", { message: err.message });
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
        }
        process.exit(1);
      }
    });

  // --- Subcommand: status ---
  program
    .command("status")
    .description("Check Connect Flow bridge, extension, and tab visibility")
    .option("--json", "output as JSON", false)
    .option("--no-auto-start", "do not auto-start bridge if offline")
    .action(async (opts) => {
      const client = getClient();
      let status = await client.getStatus("flow");
      if (!status && opts.autoStart !== false) {
        status = await client.ensureBridge("flow").catch(() => null);
      }

      if (opts.json) {
        console.log(JSON.stringify(status || { connected: false }, null, 2));
        return;
      }

      if (!status) {
        console.log("\x1b[31m✖ Bridge offline\x1b[0m");
        console.log("Run \x1b[36mconnect-flow bridge start\x1b[0m to run the local bridge daemon.");
        return;
      }

      console.log(`\x1b[32m✔ Bridge:\x1b[0m up (v${status.bridgeVersion})`);
      console.log(`\x1b[32m✔ Extension:\x1b[0m ${status.extensionConnected ? "\x1b[32mconnected\x1b[0m" : "\x1b[31mNOT CONNECTED\x1b[0m"}`);
      console.log(`\x1b[32m✔ Plan:\x1b[0m ${status.plan || "pro"}`);

      const tabState = status.flowTab === "HIDDEN" || status.flowTab === false
        ? "\x1b[33mHIDDEN (bring Flow window to front to prevent throttling)\x1b[0m"
        : "\x1b[32mvisible & active\x1b[0m";
      console.log(`\x1b[32m✔ Flow tab:\x1b[0m ${tabState}`);
      console.log(`\x1b[32m✔ Active jobs:\x1b[0m ${status.activeJobs || 0}`);
    });

  // --- Subcommand: doctor ---
  program
    .command("doctor")
    .description("Run deep diagnostic on agent integration and environment")
    .action(async () => {
      console.log("\x1b[1m=== Connect Flow Doctor ===\x1b[0m\n");

      // 1. Node check
      const nodeVer = process.version;
      const nodeMajor = Number(nodeVer.replace(/^v/, "").split(".")[0]);
      console.log(`Node.js Version: ${nodeVer} ${nodeMajor >= 20 ? "\x1b[32m✔ (Supported)\x1b[0m" : "\x1b[31m✖ (Requires >= 20)\x1b[0m"}`);

      // 2. Bridge check
      const client = getClient();
      const status = await client.getStatus("flow");
      if (status) {
        console.log(`Bridge Daemon: \x1b[32m✔ Running on port ${client.port}\x1b[0m`);
        console.log(`Extension: ${status.extensionConnected ? "\x1b[32m✔ Connected\x1b[0m" : "\x1b[33m⚠ Extension not connected. Open Chrome with Connect Flow enabled.\x1b[0m"}`);
        console.log(`Flow Tab: ${status.flowTab === "visible" || status.flowTab === true ? "\x1b[32m✔ Tab is visible\x1b[0m" : "\x1b[33m⚠ Flow tab is hidden or minimized\x1b[0m"}`);
      } else {
        console.log(`Bridge Daemon: \x1b[33m⚠ Offline. Will auto-spawn on first generation.\x1b[0m`);
      }

      // 3. MCP setup check
      const claudeSkills = path.join(os.homedir(), ".claude", "skills");
      console.log(`Claude Skills Directory: ${fs.existsSync(claudeSkills) ? "\x1b[32m✔ Present\x1b[0m" : "\x1b[90mNot installed\x1b[0m"}`);
    });

  // --- Subcommand: bridge ---
  const bridgeCmd = program.command("bridge").description("Manage the local bridge daemon");
  bridgeCmd
    .command("start")
    .description("Start the bridge server in foreground")
    .action(() => {
      const server = new BridgeServer({ port: Number(program.opts().port || BRIDGE_DEFAULT_PORT) });
      server.start();
    });

  // --- Subcommand: mcp ---
  program
    .command("mcp")
    .description("Launch stdio MCP server for AI coding agents (Claude, Gemini, Cursor)")
    .action(async () => {
      await runMcpServer();
    });

  return program;
}
