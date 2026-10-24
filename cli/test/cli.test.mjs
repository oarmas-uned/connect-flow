import assert from "node:assert/strict";
import path from "node:path";
import { slugifyPrompt, resolveOutputPath, formatNamingPattern } from "../src/namer.mjs";
import { SafetyGuard } from "../src/safety.mjs";
import { CombinatoricsEngine } from "../src/combinatorics.mjs";
import {
  CHARACTER_VOICES,
  extractCharacterMentions,
  normalizeAspectRatio,
  normalizeMode,
  normalizeModel,
  normalizeVoice
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

// Test 8: Combinatorics Engine
const template = "A majestic [animal] in a [setting]";
const vars = {
  animal: ["fox", "wolf"],
  setting: ["snowy mountain", "neon forest"]
};
const expanded = CombinatoricsEngine.expandBatch([template], vars);
assert.equal(expanded.length, 4, "2 animals * 2 settings = 4 combinations");
assert.equal(expanded[0].prompt, "A majestic fox in a snowy mountain");
assert.equal(expanded[1].prompt, "A majestic fox in a neon forest");
assert.equal(expanded[2].prompt, "A majestic wolf in a snowy mountain");
assert.equal(expanded[3].prompt, "A majestic wolf in a neon forest");
console.log("✔ Combinatorics Engine: expanded 2x2 variables into 4 precise prompts");

// Test 9: Advanced Naming Pattern
const formattedName = formatNamingPattern({
  pattern: "{prefix}{row}_{prompt}_{slot}",
  prompt: "A cyberpunk city in rain",
  prefix: "batch_",
  row: 3,
  rowPadding: 3,
  slot: 1
});
assert.ok(formattedName.startsWith("batch_003_cyberpunk-city-rain_s1"), "Formatted name matches pattern");
console.log(`✔ Naming Pattern: formatted to "${formattedName}"`);

// Test 10: Character Voice Normalizer
assert.equal(normalizeVoice("achernar"), "Achernar");
assert.equal(normalizeVoice("Zephyr"), "Zephyr");
assert.equal(normalizeVoice("charon"), "Charon");
assert.equal(normalizeVoice("unknown-voice"), null);
assert.equal(CHARACTER_VOICES.length >= 24, true);
console.log(`✔ Voice Normalizer: verified ${CHARACTER_VOICES.length} Google Flow character voices`);

// Test 11: Character Mention Extractor
const mentions = extractCharacterMentions("Cyberpunk battle between @Neo and @Trinity near the core");
assert.deepEqual(mentions, ["Neo", "Trinity"]);
console.log("✔ Character Mentions: correctly extracted ['Neo', 'Trinity']");

console.log("\nAll 11 test suites passed successfully! 🎉");
