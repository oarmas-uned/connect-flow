/**
 * Real-time event and progress streamer for Connect Flow CLI.
 * Supports human-friendly colored terminal tickers and NDJSON machine streams for AI agents.
 */
export class Streamer {
  constructor({ mode = "human", verbose = false } = {}) {
    this.mode = mode; // "human", "json", "stream", "silent"
    this.startTime = Date.now();
    this.lastStage = null;
    this.timer = null;
  }

  get elapsedSec() {
    return ((Date.now() - this.startTime) / 1000).toFixed(1);
  }

  /**
   * Emit an event to stdout
   */
  emit(event, data = {}) {
    const timestamp = Date.now();
    const elapsed = this.elapsedSec;

    if (this.mode === "silent") return;

    if (this.mode === "stream") {
      // Machine-readable NDJSON stream for agents
      const payload = {
        event,
        elapsedSec: Number(elapsed),
        timestamp,
        ...data
      };
      process.stdout.write(JSON.stringify(payload) + "\n");
      return;
    }

    if (this.mode === "human") {
      this._renderHumanEvent(event, data, elapsed);
    }
  }

  _renderHumanEvent(event, data, elapsed) {
    const timeBadge = `\x1b[90m[${elapsed.padStart(4, " ")}s]\x1b[0m`;

    switch (event) {
      case "connecting":
        console.log(`${timeBadge} \x1b[36m⚡ Connecting to Connect Flow bridge (port ${data.port || 8791})...\x1b[0m`);
        break;

      case "connected":
        console.log(`${timeBadge} \x1b[32m✔ Bridge connected\x1b[0m | Plan: \x1b[33m${data.plan || "pro"}\x1b[0m | Tab: \x1b[32m${data.tab || "visible"}\x1b[0m`);
        break;

      case "tab_warning":
        console.log(`${timeBadge} \x1b[33m⚠ Warning: Flow browser tab is hidden or minimized.\x1b[0m Bring it to the front to avoid generation throttling.`);
        break;

      case "job_submitting":
        console.log(`${timeBadge} \x1b[35m📤 Submitting generation request...\x1b[0m Mode: \x1b[1m${data.mode}\x1b[0m`);
        break;

      case "job_submitted":
        console.log(`${timeBadge} \x1b[34m🚀 Job accepted\x1b[0m | ID: \x1b[90m${data.jobId}\x1b[0m | Model: \x1b[36m${data.model || "default"}\x1b[0m`);
        break;

      case "progress":
        if (data.stage && data.stage !== this.lastStage) {
          this.lastStage = data.stage;
          console.log(`${timeBadge} \x1b[36m⏳ Flow progress:\x1b[0m ${data.stage}...`);
        }
        break;

      case "downloading":
        console.log(`${timeBadge} \x1b[35m📥 Asset ready, saving to target file...\x1b[0m`);
        break;

      case "complete":
        console.log(`${timeBadge} \x1b[32m✨ Generation complete in ${elapsed}s!\x1b[0m`);
        if (data.file) {
          console.log(`   \x1b[1m📁 Saved:\x1b[0m \x1b[32m${data.file.path}\x1b[0m (${(data.file.sizeBytes / 1024).toFixed(1)} KB)`);
        }
        break;

      case "error":
        console.error(`${timeBadge} \x1b[31m✖ Error:\x1b[0m ${data.message || "Operation failed"}`);
        break;

      case "info":
        console.log(`${timeBadge} \x1b[90mℹ ${data.message}\x1b[0m`);
        break;

      default:
        if (data.message) {
          console.log(`${timeBadge} ${data.message}`);
        }
    }
  }

  /**
   * Final output for --json mode (clean single structured JSON object)
   */
  outputJson(result) {
    if (this.mode === "json") {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}
