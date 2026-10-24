export const BRIDGE_DEFAULT_PORT = 8791;
export const BRIDGE_VERSION = "2.0.0-beta";
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

/**
 * 24+ Google Flow Character Voice Performances.
 */
export const CHARACTER_VOICES = [
  { id: "achernar", label: "Achernar", gender: "female" },
  { id: "achird", label: "Achird", gender: "male" },
  { id: "algenib", label: "Algenib", gender: "male" },
  { id: "algieba", label: "Algieba", gender: "male" },
  { id: "alnilam", label: "Alnilam", gender: "male" },
  { id: "aoede", label: "Aoede", gender: "female" },
  { id: "autonoe", label: "Autonoe", gender: "female" },
  { id: "callirrhoe", label: "Callirrhoe", gender: "female" },
  { id: "charon", label: "Charon", gender: "male" },
  { id: "despina", label: "Despina", gender: "female" },
  { id: "enceladus", label: "Enceladus", gender: "male" },
  { id: "erinome", label: "Erinome", gender: "female" },
  { id: "fenrir", label: "Fenrir", gender: "male" },
  { id: "gacrux", label: "Gacrux", gender: "female" },
  { id: "iapetus", label: "Iapetus", gender: "male" },
  { id: "kore", label: "Kore", gender: "female" },
  { id: "laomedeia", label: "Laomedeia", gender: "female" },
  { id: "leda", label: "Leda", gender: "female" },
  { id: "orus", label: "Orus", gender: "male" },
  { id: "puck", label: "Puck", gender: "male" },
  { id: "pulcherrima", label: "Pulcherrima", gender: "ungendered" },
  { id: "rasalgethi", label: "Rasalgethi", gender: "male" },
  { id: "sadachbia", label: "Sadachbia", gender: "male" },
  { id: "sadaltager", label: "Sadaltager", gender: "male" },
  { id: "schedar", label: "Schedar", gender: "male" },
  { id: "sulafat", label: "Sulafat", gender: "female" },
  { id: "umbriel", label: "Umbriel", gender: "male" },
  { id: "vindemiatrix", label: "Vindemiatrix", gender: "female" },
  { id: "zephyr", label: "Zephyr", gender: "female" },
  { id: "zubenelgenubi", label: "Zubenelgenubi", gender: "male" }
];

export function normalizeVoice(voiceStr) {
  if (!voiceStr || typeof voiceStr !== "string") return null;
  const s = voiceStr.toLowerCase().trim();
  const match = CHARACTER_VOICES.find(v => v.id === s || v.label.toLowerCase() === s);
  return match ? match.label : null;
}

/**
 * Extract @character mentions from a prompt string.
 */
export function extractCharacterMentions(prompt) {
  if (!prompt || typeof prompt !== "string") return [];
  const regex = /(?<![\p{L}\p{N}_\\])@([^\s@.,;:!?()[\]{}<>"']+)/gu;
  const mentions = [];
  let m;
  while ((m = regex.exec(prompt)) !== null) {
    mentions.push(m[1].trim());
  }
  return Array.from(new Set(mentions));
}

