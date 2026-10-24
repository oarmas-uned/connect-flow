export const BRIDGE_DEFAULT_PORT = 8791;
export const BRIDGE_VERSION = "1.3.1";
export const BRAND_NAME = "Connect Flow";
export const DEFAULT_PROJECT_URL = "https://flow.google.com/project/a9300285-30e0-4fdc-be67-772ef546b1fe";

export const IMAGE_MODELS = [
  "nano-banana-pro",
  "nano-banana-2",
  "nano-banana-2-lite"
];

export const VIDEO_MODELS = [
  "omni-flash",
  "veo-3.1-lite",
  "veo-3.1-fast",
  "veo-3.1-quality"
];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
export const VIDEO_DURATIONS = ["4", "6", "8", "10"];
export const VIDEO_RESOLUTIONS = ["360p", "720p"];

export const DEFAULT_IMAGE_MODEL = "nano-banana-pro";
export const DEFAULT_VIDEO_MODEL = "omni-flash";
export const DEFAULT_ASPECT_RATIO = "1:1";
export const DEFAULT_VIDEO_DURATION = "6";

export const BLOCKED_PATTERNS = [
  /violate(s)? our policy/i,
  /content policy/i,
  /moderation block/i,
  /not allowed/i,
  /try a different prompt/i
];

/**
 * Smart normalizer for model aliases used by AI coding agents.
 * Supports:
 * - "Nano Banana Pro" -> "nano-banana-pro"
 * - "Nano Banana 2.1", "Nano Banana 2" -> "nano-banana-2"
 * - "Nano Banana 2 Lite" -> "nano-banana-2-lite"
 * - "Veo 3 Fast", "Veo 3.1 Fast" -> "veo-3.1-fast"
 * - "Veo 3 Lite", "Veo 3.1 Lite" -> "veo-3.1-lite"
 * - "Veo 3 Quality", "Veo 3.1 Quality" -> "veo-3.1-quality"
 * - "Omni Flash 1.1", "Omni Flash" -> "omni-flash"
 */
export function normalizeModel(modelStr, isVideo = false) {
  if (!modelStr || typeof modelStr !== "string") {
    return isVideo ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL;
  }

  const s = modelStr.toLowerCase().replace(/[._-]/g, " ").trim();

  // Video models
  if (s.includes("veo")) {
    if (s.includes("quality")) return "veo-3.1-quality";
    if (s.includes("lite")) return "veo-3.1-lite";
    return "veo-3.1-fast"; // default veo variant
  }
  if (s.includes("omni") || s.includes("flash")) {
    return "omni-flash";
  }

  // Image models
  if (s.includes("pro")) return "nano-banana-pro";
  if (s.includes("lite")) return "nano-banana-2-lite";
  if (s.includes("2 1") || s.includes("2") || s.includes("banana")) return "nano-banana-2";

  return isVideo ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL;
}

/**
 * Smart aspect ratio normalizer.
 * Supports "1:1", "16:9", "9:16", "4:3", "3:4" as well as names like "square", "portrait", "landscape".
 */
export function normalizeAspectRatio(ratioStr) {
  if (!ratioStr || typeof ratioStr !== "string") return DEFAULT_ASPECT_RATIO;
  const s = ratioStr.toLowerCase().trim();

  if (s === "1:1" || s === "1x1" || s === "square") return "1:1";
  if (s === "16:9" || s === "16x9" || s === "landscape" || s === "wide" || s === "widescreen") return "16:9";
  if (s === "9:16" || s === "9x16" || s === "portrait" || s === "vertical" || s === "shorts" || s === "reels" || s === "tiktok") return "9:16";
  if (s === "4:3" || s === "4x3") return "4:3";
  if (s === "3:4" || s === "3x4") return "3:4";

  return DEFAULT_ASPECT_RATIO;
}

/**
 * Normalize mode string into internal Flow mode.
 */
export function normalizeMode(modeStr = "image", hasImages = false) {
  const s = (modeStr || "").toLowerCase().trim();
  const isVideo = s.includes("vid") || s.includes("movie") || s.includes("clip");

  if (isVideo) {
    if (s.includes("frame") || (hasImages && !s.includes("text"))) return "flow-frame-to-video";
    if (s.includes("extend")) return "flow-extend-video";
    return "flow-text-to-video";
  }

  if (s.includes("img2img") || (hasImages && !s.includes("text"))) {
    return "flow-image-to-image";
  }

  return "flow-text-to-image";
}
