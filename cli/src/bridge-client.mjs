import { spawn } from "node:child_process";
import path from "node:path";
import { BRIDGE_DEFAULT_PORT, DEFAULT_PROJECT_URL, DEFAULT_IMAGE_MODEL } from "./constants.mjs";
import { SafetyGuard } from "./safety.mjs";
import { resolveOutputPath, relocateOutputFile } from "./namer.mjs";

export class BridgeClient {
  constructor({ port = BRIDGE_DEFAULT_PORT, daemonArgs = null } = {}) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.daemonArgs = daemonArgs;
  }

  async fetchJson(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status} from bridge`);
      }
      return data;
    } catch (err) {
      if (err.cause?.code === "ECONNREFUSED" || err.code === "ECONNREFUSED") {
        return null; // Bridge offline
      }
      throw err;
    }
  }

  /**
   * Get current bridge + extension status.
   */
  async getStatus(site = "flow") {
    return this.fetchJson(`/status?site=${site}`);
  }

  /**
   * Ensure the bridge daemon is running. If not, auto-spawn it.
   */
  async ensureBridge(site = "flow", streamer = null) {
    let status = await this.getStatus(site);
    if (status) return status;

    if (streamer) {
      streamer.emit("info", { message: "Bridge daemon not detected. Launching in background..." });
    }

    if (this.daemonArgs && this.daemonArgs.length > 0) {
      const child = spawn(process.execPath, this.daemonArgs, {
        detached: true,
        stdio: "ignore"
      });
      child.unref();

      // Poll until online (up to 6 seconds)
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 250));
        status = await this.getStatus(site);
        if (status) return status;
      }
    }

    throw new Error(
      `Could not connect to Connect Flow bridge on port ${this.port}. ` +
      `Ensure the bridge is running with 'connect-flow bridge start' or 'flow-auto bridge start'.`
    );
  }

  /**
   * Wait until the browser extension connects (up to timeoutMs).
   */
  async waitForExtension(site = "flow", timeoutMs = 30000, streamer = null) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.getStatus(site);
      if (status?.extensionConnected) {
        return status;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return null;
  }

  /**
   * Submit and track a complete generation job in real time.
   */
  async executeJob({
    mode = "flow-text-to-image",
    prompt,
    model = mode.includes("video") ? "omni-flash" : DEFAULT_IMAGE_MODEL,
    project = DEFAULT_PROJECT_URL,
    aspectRatio = "16:9",
    duration = "6",
    resolution = "720p",
    output = null,
    dir = process.cwd(),
    imagePaths = [],
    waitTimeoutMin = 15,
    autoWaitTab = false,
    streamer
  }) {
    // 1. Pre-flight prompt validation
    const promptCheck = SafetyGuard.validatePrompt(prompt);
    if (!promptCheck.valid) {
      throw new Error(promptCheck.error);
    }

    // 2. Anti-burst pacing
    await SafetyGuard.antiBurstDelay();

    // 3. Connect to bridge
    streamer.emit("connecting", { port: this.port });
    const status = await this.ensureBridge("flow", streamer);

    // 4. Tab health verification
    const health = SafetyGuard.evaluateTabHealth(status);
    if (!health.ok) {
      if (health.code === "TAB_HIDDEN") {
        streamer.emit("tab_warning");
        if (autoWaitTab) {
          streamer.emit("info", { message: "Waiting for Flow tab to become visible..." });
          let tabVisible = false;
          while (!tabVisible) {
            await new Promise(r => setTimeout(r, 1500));
            const currentStatus = await this.getStatus("flow");
            if (currentStatus?.flowTab && currentStatus.flowTab !== "HIDDEN") {
              tabVisible = true;
              streamer.emit("info", { message: "Flow tab is now visible. Resuming..." });
            }
          }
        }
      } else if (health.code === "EXTENSION_DISCONNECTED") {
        throw new Error(health.message);
      }
    }

    streamer.emit("connected", {
      plan: status?.plan || "pro",
      tab: status?.flowTab ? "visible" : "hidden"
    });

    // 5. Build Job Spec
    const isVideo = mode.includes("video");
    const jobSpec = {
      prompt,
      mode,
      params: {
        aspectRatio,
        imageModel: isVideo ? undefined : (model || DEFAULT_IMAGE_MODEL),
        project,
        videoOption: isVideo ? `${String(duration).replace(/s$/, "")}s` : undefined,
        videoResolution: isVideo ? (resolution === "360p" ? "480p" : resolution) : undefined,
        outputsPerPrompt: 1,
        downloadSubfolder: "connect-flow",
        autoRenameFiles: true
      },
      inputImages: [],
      assetRefs: [],
      characterRefs: []
    };

    streamer.emit("job_submitting", { mode, prompt });

    // 6. Submit Job
    const submitResult = await this.fetchJson("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job: jobSpec,
        imagePaths: imagePaths.map(p => path.resolve(process.cwd(), p)),
        client: "connect-flow-agent"
      })
    });

    const jobId = submitResult.jobId;
    streamer.emit("job_submitted", { jobId, model: isVideo ? model : jobSpec.params.imageModel });

    // 7. Real-Time Tracking Loop
    const deadline = Date.now() + (waitTimeoutMin * 60 * 1000);
    let job = null;

    while (Date.now() < deadline) {
      // Long-poll slice (up to 3 seconds)
      job = await this.fetchJson(`/jobs/${jobId}/wait?timeoutMs=3000`);

      if (!job) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (job.stage) {
        streamer.emit("progress", { stage: job.stage, status: job.status });
      }

      if (job.status === "done") {
        break;
      }

      if (job.status === "failed") {
        const isBlocked = SafetyGuard.isPolicyBlock(job.error);
        const errMsg = isBlocked
          ? `Prompt was refused by Google Flow content policy: "${job.error}". Please rephrase your prompt.`
          : `Generation failed: ${job.error || "Unknown error"}`;
        throw new Error(errMsg);
      }

      if (job.status === "cancelled") {
        throw new Error("Generation job was cancelled.");
      }
    }

    if (!job || job.status !== "done") {
      throw new Error(`Generation timed out after ${waitTimeoutMin} minutes.`);
    }

    // 8. Relocate & Clean Filenames
    const downloadedFiles = job.files || [];
    if (downloadedFiles.length === 0) {
      throw new Error("Job completed but no downloaded file was reported by extension.");
    }

    streamer.emit("downloading");

    const processedFiles = [];
    for (let i = 0; i < downloadedFiles.length; i++) {
      const src = downloadedFiles[i].path;
      const target = resolveOutputPath({
        prompt,
        mode,
        explicitOutput: output,
        targetDir: dir,
        index: i,
        extension: path.extname(src)
      });

      const relocated = relocateOutputFile(src, target);
      processedFiles.push({
        ...relocated,
        mime: downloadedFiles[i].mime
      });
    }

    const finalResult = {
      success: true,
      jobId,
      prompt,
      mode,
      model: model || (isVideo ? "omni-flash" : "nano-banana-pro"),
      aspectRatio,
      files: processedFiles,
      primaryFile: processedFiles[0],
      durationSec: Number(streamer.elapsedSec)
    };

    streamer.emit("complete", { file: processedFiles[0] });
    return finalResult;
  }
}
