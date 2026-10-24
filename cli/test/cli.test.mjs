import assert from "node:assert/strict";
import path from "node:path";
import { slugifyPrompt, resolveOutputPath } from "../src/namer.mjs";
import { SafetyGuard } from "../src/safety.mjs";

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

console.log("\nAll 4 test suites passed successfully! 🎉");
