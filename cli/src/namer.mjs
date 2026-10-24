import fs from "node:fs";
import path from "node:path";

/**
 * Generate a clean, readable slug from a prompt text.
 * Trims fluff words, removes punctuation, limits length to 35-45 chars.
 */
export function slugifyPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") return "flow-generation";

  // Stop words to keep slugs concise and descriptive
  const stopWords = new Set([
    "a", "an", "the", "in", "on", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "of", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "can", "will", "just", "should",
    "now", "cinematic", "photorealistic", "ultra", "realistic", "4k", "8k", "hd"
  ]);

  const clean = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(word => !stopWords.has(word) && word.length > 1);

  const slug = (clean.length > 0 ? clean.slice(0, 5) : [prompt.slice(0, 20)]).join("-");
  return slug.slice(0, 40).replace(/-+$/, "") || "flow-generation";
}

/**
 * Resolve target destination path for an output file.
 * Handles explicit paths (-o / --output), custom directory (--dir),
 * and automatic slug generation.
 */
export function resolveOutputPath({
  prompt = "",
  mode = "flow-text-to-image",
  explicitOutput = null,
  targetDir = process.cwd(),
  index = 0,
  extension = null
}) {
  const isVideo = mode.includes("video");
  const ext = extension || (isVideo ? ".mp4" : ".png");

  if (explicitOutput) {
    const fullPath = path.isAbsolute(explicitOutput)
      ? explicitOutput
      : path.resolve(process.cwd(), explicitOutput);

    // If explicit output already has an extension, respect it
    const hasExt = path.extname(fullPath).length > 0;
    const finalPath = hasExt ? fullPath : `${fullPath}${ext}`;
    return finalPath;
  }

  // Automatic clean slug name
  const slug = slugifyPrompt(prompt);
  const suffix = index > 0 ? `-${index + 1}` : "";
  const filename = `${slug}${suffix}${ext}`;

  return path.resolve(targetDir, filename);
}

/**
 * Move or copy the generated file from its source download location
 * to the target path, creating any required directories along the way.
 */
export function relocateOutputFile(sourcePath, targetPath, overwrite = true) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Generated source file not found at: ${sourcePath}`);
  }

  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let finalDestination = targetPath;
  if (!overwrite && fs.existsSync(targetPath)) {
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);
    let counter = 1;
    while (fs.existsSync(path.join(targetDir, `${base}-${counter}${ext}`))) {
      counter++;
    }
    finalDestination = path.join(targetDir, `${base}-${counter}${ext}`);
  }

  try {
    fs.renameSync(sourcePath, finalDestination);
  } catch (err) {
    // Cross-device fallback (e.g., across drives or temp mounts)
    fs.copyFileSync(sourcePath, finalDestination);
    try {
      fs.unlinkSync(sourcePath);
    } catch (_) {}
  }

  const stats = fs.statSync(finalDestination);
  return {
    path: finalDestination,
    relativePath: path.relative(process.cwd(), finalDestination) || path.basename(finalDestination),
    filename: path.basename(finalDestination),
    sizeBytes: stats.size,
    extension: path.extname(finalDestination)
  };
}
