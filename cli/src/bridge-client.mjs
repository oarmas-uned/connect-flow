import { spawn } from "node:child_process";
import path from "node:path";
import {
  BRIDGE_DEFAULT_PORT,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROJECT_URL,
  DEFAULT_VIDEO_MODEL,
  extractCharacterMentions,
  normalizeAspectRatio,
  normalizeMode,
  normalizeModel,
  normalizeVoice
} from "./constants.mjs";
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
    aspectRatio = DEFAULT_ASPECT_RATIO,
    duration = "6",
    resolution = "720p",
    outputsPerPrompt = 1,
    output = null,
    namingPattern = null,
    prefix = "",
    row = 1,
    rowPadding = 1,
    dir = process.cwd(),
    imagePaths = [],
    startFrame = null,
    endFrame = null,
    voiceName = null,
    voiceStyle = null,
    characterRefs = [],
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

    // 5. Build Job Spec & Assemble Images
    const resolvedInputImages = [...(imagePaths || [])];
    let resolvedMode = normalizeMode(mode, resolvedInputImages.length > 0 || !!startFrame || !!endFrame);
    if (startFrame || endFrame) {
      resolvedMode = "flow-frame-to-video";
      if (startFrame && !resolvedInputImages.includes(startFrame)) resolvedInputImages.unshift(startFrame);
      if (endFrame && !resolvedInputImages.includes(endFrame)) resolvedInputImages.push(endFrame);
    }

    const isVideo = resolvedMode.includes("video");
    const resolvedModel = normalizeModel(model, isVideo);
    const resolvedRatio = normalizeAspectRatio(aspectRatio);
    const resolvedVoice = normalizeVoice(voiceName);

    // Auto-detect @character mentions if not explicitly passed
    const detectedCharacters = extractCharacterMentions(prompt);
    const combinedCharacterRefs = Array.from(new Set([...(characterRefs || []), ...detectedCharacters]));

    const jobSpec = {
      prompt,
      mode: resolvedMode,
      params: {
        aspectRatio: resolvedRatio,
        imageModel: isVideo ? undefined : resolvedModel,
        project,
        videoOption: isVideo ? `${String(duration).replace(/s$/, "")}s` : undefined,
        videoResolution: isVideo ? (resolution === "360p" ? "480p" : resolution) : undefined,
        outputsPerPrompt: Math.max(1, Math.min(4, Number(outputsPerPrompt) || 1)),
        downloadSubfolder: "connect-flow",
        autoRenameFiles: true,
        voiceName: resolvedVoice || undefined,
        voiceStyle: voiceStyle || undefined
      },
      inputImages: [],
      assetRefs: [],
      characterRefs: combinedCharacterRefs
    };

    streamer.emit("job_submitting", { mode: resolvedMode, prompt, model: resolvedModel });

    // 6. Submit Job
    const submitResult = await this.fetchJson("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job: jobSpec,
        imagePaths: resolvedInputImages.map(p => path.resolve(process.cwd(), p)),
        client: "connect-flow-agent"
      })
    });

    const jobId = submitResult.jobId;
    streamer.emit("job_submitted", { jobId, model: resolvedModel });

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
        mode: resolvedMode,
        explicitOutput: output,
        namingPattern,
        prefix,
        row,
        rowPadding,
        slot: i + 1,
        model: resolvedModel,
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
      mode: resolvedMode,
      model: resolvedModel,
      aspectRatio: resolvedRatio,
      files: processedFiles,
      primaryFile: processedFiles[0],
      durationSec: Number(streamer.elapsedSec)
    };

    streamer.emit("complete", { file: processedFiles[0] });
    return finalResult;
  }

  /**
   * Execute an array of generation jobs sequentially with adaptive delays.
   */
  async executeBatch({
    jobs = [],
    delaySec = 3,
    autoWaitTab = false,
    streamer
  }) {
    const results = [];
    const total = jobs.length;

    streamer.emit("batch_start", { total });

    for (let i = 0; i < total; i++) {
      const jobConfig = jobs[i];
      streamer.emit("batch_job_start", { index: i + 1, total, prompt: jobConfig.prompt });

      try {
        const res = await this.executeJob({
          ...jobConfig,
          row: i + 1,
          autoWaitTab,
          streamer
        });
        results.push({ success: true, index: i + 1, ...res });
      } catch (err) {
        results.push({
          success: false,
          index: i + 1,
          prompt: jobConfig.prompt,
          error: err.message
        });
        streamer.emit("error", { message: `Batch item ${i + 1}/${total} failed: ${err.message}` });
      }

      if (i < total - 1) {
        const actualDelay = Math.max(1, delaySec) * 1000 + Math.floor(Math.random() * 1000);
        await new Promise(r => setTimeout(r, actualDelay));
      }
    }

    const summary = {
      total,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };

    streamer.emit("batch_complete", summary);
    return summary;
  }
}
