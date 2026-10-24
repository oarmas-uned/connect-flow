import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocketServer } from "ws";
import { BRIDGE_DEFAULT_PORT, BRIDGE_VERSION } from "./constants.mjs";

const STORE_DIR = path.join(os.homedir(), ".connect-flow");
const JOBS_FILE = path.join(STORE_DIR, "jobs.json");

export class BridgeServer {
  constructor({ port = BRIDGE_DEFAULT_PORT } = {}) {
    this.port = port;
    this.jobs = new Map();
    this.jobFiles = new Map();
    this.activeSockets = new Set();
    this.extensionState = {
      connected: false,
      site: "flow",
      plan: "pro",
      flowTab: true,
      lastHeartbeat: 0
    };
    this.events = new EventEmitter();
    this.events.setMaxListeners(200);
  }

  initStorage() {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    if (fs.existsSync(JOBS_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
        for (const j of raw) {
          if (["queued", "running", "downloading"].includes(j.status)) {
            j.status = "failed";
            j.error = "Bridge restarted while job was in flight";
          }
          this.jobs.set(j.id, j);
        }
      } catch (_) {}
    }
  }

  saveJobs() {
    try {
      const arr = Array.from(this.jobs.values()).slice(-100);
      fs.writeFileSync(JOBS_FILE, JSON.stringify(arr, null, 2), "utf-8");
    } catch (_) {}
  }

  start() {
    this.initStorage();

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });

    this.wss.on("connection", (ws, req) => {
      this.activeSockets.add(ws);
      this.extensionState.connected = true;

      // Send handshake
      ws.send(JSON.stringify({ t: "bridge.hello", bridgeVersion: BRIDGE_VERSION }));

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          this.handleExtensionMessage(msg, ws);
        } catch (err) {
          console.warn("[Bridge] Bad message:", err.message);
        }
      });

      ws.on("close", () => {
        this.activeSockets.delete(ws);
        if (this.activeSockets.size === 0) {
          this.extensionState.connected = false;
        }
      });
    });

    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[Connect Flow] Bridge listening on http://127.0.0.1:${this.port}`);
    });

    return this.server;
  }

  handleExtensionMessage(msg, ws) {
    switch (msg.t) {
      case "ext.hello":
      case "ext.status":
        this.extensionState.connected = true;
        this.extensionState.plan = msg.plan || "pro";
        this.extensionState.flowTab = msg.flowTab ?? true;
        this.extensionState.lastHeartbeat = Date.now();
        break;

      case "ext.heartbeat":
        this.extensionState.lastHeartbeat = Date.now();
        break;

      case "job.accepted":
        this.updateJob(msg.jobId, { status: "running" });
        break;

      case "job.progress":
        this.updateJob(msg.jobId, { status: "running", stage: msg.stage });
        break;

      case "job.result":
        this.updateJob(msg.jobId, {
          status: "done",
          files: msg.files || [],
          stage: undefined,
          error: msg.warning
        });
        break;

      case "job.failed":
        this.updateJob(msg.jobId, {
          status: "failed",
          error: msg.error || "Generation rejected"
        });
        break;
    }
  }

  updateJob(id, updates) {
    const existing = this.jobs.get(id);
    if (!existing) return;
    Object.assign(existing, updates);
    this.jobs.set(id, existing);
    this.saveJobs();
    this.events.emit(`job:${id}`, existing);
  }

  sendToExtension(payload) {
    let sent = false;
    for (const ws of this.activeSockets) {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify(payload));
        sent = true;
      }
    }
    return sent;
  }

  async handleHttp(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        bridgeVersion: BRIDGE_VERSION,
        extensionConnected: this.extensionState.connected,
        site: "flow",
        plan: this.extensionState.plan,
        flowTab: this.extensionState.flowTab ? "visible" : "HIDDEN",
        activeJobs: Array.from(this.jobs.values()).filter(j => j.status === "running").length
      }));
      return;
    }

    if (url.pathname === "/jobs" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
          const job = {
            id: jobId,
            prompt: parsed.job.prompt,
            mode: parsed.job.mode,
            params: parsed.job.params,
            status: "queued",
            client: parsed.client || "cli",
            createdAt: Date.now(),
            files: []
          };

          this.jobs.set(jobId, job);
          this.saveJobs();

          // Dispatch to extension
          const delivered = this.sendToExtension({
            t: "job.start",
            job,
            inputFiles: []
          });

          if (delivered) {
            job.status = "running";
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jobId }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    const waitMatch = url.pathname.match(/^\/jobs\/([^/]+)\/wait$/);
    if (waitMatch && req.method === "GET") {
      const jobId = waitMatch[1];
      const job = this.jobs.get(jobId);
      if (!job) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
        return;
      }

      if (["done", "failed", "cancelled"].includes(job.status)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(job));
        return;
      }

      const timeoutMs = Number(url.searchParams.get("timeoutMs") || 3000);
      const onUpdate = (updatedJob) => {
        clearTimeout(timer);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(updatedJob));
      };

      const timer = setTimeout(() => {
        this.events.removeListener(`job:${jobId}`, onUpdate);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.jobs.get(jobId)));
      }, timeoutMs);

      this.events.once(`job:${jobId}`, onUpdate);
      return;
    }

    const getMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
    if (getMatch && req.method === "GET") {
      const jobId = getMatch[1];
      const job = this.jobs.get(jobId);
      if (!job) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(job));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
