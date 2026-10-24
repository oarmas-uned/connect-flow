import assert from "node:assert/strict";
import path from "node:path";
import { slugifyPrompt, resolveOutputPath } from "../src/namer.mjs";
import { SafetyGuard } from "../src/safety.mjs";
import {
  normalizeAspectRatio,
  normalizeMode,
  normalizeModel
} from "../src/constants.mjs";

console.log("Running Connect Flow CLI unit tests...");

// Test 1: Slugify prompt
const slug1 = slugifyPrompt("A cinematic photorealistic close up of an arctic fox in snow");
assert.ok(slug1.includes("fox") || slug1.includes("arctic"), "Slug should extract core keywords");
console.log(`✔ Slugify: "A cinematic photorealistic close up of an arctic fox in snow" -> "${slug1}"`);

// Test 2: Resolve explicit output
const explicit = resolveOutputPath({
  prompt: "Anything",
  explicitOutput: "./assets/custom-hero.png"
});
assert.ok(explicit.endsWith(path.join("assets", "custom-hero.png")), "Should resolve explicit path");
console.log(`✔ Explicit Output: -> "${explicit}"`);

// Test 3: Tab Health Evaluation
const hiddenCheck = SafetyGuard.evaluateTabHealth({
  extensionConnected: true,
  flowTab: "HIDDEN"
});
assert.equal(hiddenCheck.ok, false);
assert.equal(hiddenCheck.code, "TAB_HIDDEN");
console.log("✔ SafetyGuard: detected hidden Flow tab correctly");

const healthyCheck = SafetyGuard.evaluateTabHealth({
  extensionConnected: true,
  flowTab: true
});
assert.equal(healthyCheck.ok, true);
console.log("✔ SafetyGuard: verified active Flow tab correctly");

// Test 4: Policy detection
assert.equal(SafetyGuard.isPolicyBlock("This prompt violates our content policy."), true);
assert.equal(SafetyGuard.isPolicyBlock("Network timeout error"), false);
console.log("✔ SafetyGuard: policy block detector working");

// Test 5: Model Normalizer (AI Agent Aliases)
assert.equal(normalizeModel("Nano Banana Pro"), "nano-banana-pro");
assert.equal(normalizeModel("Nano Banana 2.1"), "nano-banana-2");
assert.equal(normalizeModel("Nano Banana 2 Lite"), "nano-banana-2-lite");
assert.equal(normalizeModel("Veo 3 Fast", true), "veo-3.1-fast");
assert.equal(normalizeModel("Veo 3 Quality", true), "veo-3.1-quality");
assert.equal(normalizeModel("Omni Flash 1.1", true), "omni-flash");
console.log("✔ Model Normalizer: correctly mapped all AI agent aliases");

// Test 6: Aspect Ratio Normalizer (Default 1:1)
assert.equal(normalizeAspectRatio("1:1"), "1:1");
assert.equal(normalizeAspectRatio("square"), "1:1");
assert.equal(normalizeAspectRatio("16:9"), "16:9");
assert.equal(normalizeAspectRatio("landscape"), "16:9");
assert.equal(normalizeAspectRatio("9:16"), "9:16");
assert.equal(normalizeAspectRatio("shorts"), "9:16");
assert.equal(normalizeAspectRatio(undefined), "1:1");
console.log("✔ Ratio Normalizer: correctly normalized 1:1 default, square, landscape, and portrait");

// Test 7: Mode Normalizer
assert.equal(normalizeMode("image"), "flow-text-to-image");
assert.equal(normalizeMode("video"), "flow-text-to-video");
assert.equal(normalizeMode("image", true), "flow-image-to-image");
assert.equal(normalizeMode("video", true), "flow-frame-to-video");
console.log("✔ Mode Normalizer: correctly handled text-to-image, text-to-video, img2img, and frame2vid");

console.log("\nAll 7 test suites passed successfully! 🎉");
