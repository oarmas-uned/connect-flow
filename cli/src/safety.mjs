import { BLOCKED_PATTERNS } from "./constants.mjs";

export class SafetyGuard {
  static lastJobTimestamp = 0;

  /**
   * Validate that the Google Flow tab is open, logged in, and active.
   * Browsers aggressively throttle tabs in the background, which freezes generation.
   */
  static evaluateTabHealth(status) {
    if (!status) {
      return {
        ok: false,
        code: "BRIDGE_OFFLINE",
        message: "Connect Flow bridge daemon is offline."
      };
    }

    if (!status.extensionConnected) {
      return {
        ok: false,
        code: "EXTENSION_DISCONNECTED",
        message: "Connect Flow extension is not connected. Ensure the extension is enabled in Chrome/Edge."
      };
    }

    // flowTab can be true, false, "HIDDEN", or undefined
    if (status.flowTab === false || status.flowTab === "HIDDEN") {
      return {
        ok: false,
        code: "TAB_HIDDEN",
        message: "Google Flow browser tab is currently hidden or minimized. Bring the Flow tab to the front to avoid generation throttling."
      };
    }

    return {
      ok: true,
      code: "HEALTHY",
      message: "Flow session active and visible."
    };
  }

  /**
   * Anti-burst safety check. Enforces a respectful delay between automated jobs
   * to protect user Google accounts against rapid-fire bot detection strikes.
   */
  static async antiBurstDelay(minDelayMs = 2500, jitterMs = 1500) {
    const now = Date.now();
    const elapsed = now - SafetyGuard.lastJobTimestamp;
    const requiredDelay = minDelayMs + Math.floor(Math.random() * jitterMs);

    if (SafetyGuard.lastJobTimestamp > 0 && elapsed < requiredDelay) {
      const waitTime = requiredDelay - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    SafetyGuard.lastJobTimestamp = Date.now();
  }

  /**
   * Pre-flight prompt inspection to prevent obvious policy refusals.
   */
  static validatePrompt(prompt) {
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return { valid: false, error: "Prompt text cannot be empty." };
    }

    const trimmed = prompt.trim();
    if (trimmed.length > 2000) {
      return { valid: false, error: "Prompt exceeds maximum length of 2000 characters." };
    }

    return { valid: true };
  }

  /**
   * Test if an error message reflects a Google content policy rejection.
   */
  static isPolicyBlock(errorText) {
    if (!errorText) return false;
    return BLOCKED_PATTERNS.some(pattern => pattern.test(errorText));
  }
}
