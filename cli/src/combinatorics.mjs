/**
 * Smart Variables & Combinatorial Prompt Expansion Engine.
 * 
 * Supports brackets [var] and braces {var}.
 * Example:
 *   Prompt: "A cinematic shot of a [color] [animal] in [environment]"
 *   Vars: { color: ["cyan", "gold"], animal: ["fox", "wolf"], environment: ["snow", "rain"] }
 *   Combinations: 2 * 2 * 2 = 8 concrete prompts.
 */

export class CombinatoricsEngine {
  /**
   * Extract all variable tags from a prompt string (e.g. "[color]" -> "color", "{style}" -> "style").
   */
  static extractVariableNames(prompt) {
    if (!prompt || typeof prompt !== "string") return [];
    const matches = new Set();
    
    // Match [name] or {name}
    const bracketRegex = /\[([a-zA-Z0-9_-]+)\]/g;
    const braceRegex = /\{([a-zA-Z0-9_-]+)\}/g;
    
    let m;
    while ((m = bracketRegex.exec(prompt)) !== null) {
      matches.add(m[1].toLowerCase());
    }
    while ((m = braceRegex.exec(prompt)) !== null) {
      matches.add(m[1].toLowerCase());
    }
    
    return Array.from(matches);
  }

  /**
   * Generate cartesian product of an array of arrays.
   */
  static cartesianProduct(arrays) {
    if (arrays.length === 0) return [[]];
    return arrays.reduce((acc, curr) => {
      const res = [];
      for (const a of acc) {
        for (const c of curr) {
          res.push([...a, c]);
        }
      }
      return res;
    }, [[]]);
  }

  /**
   * Expand a single prompt using a variable dictionary.
   * @param {string} prompt - Raw prompt template
   * @param {Record<string, string[]|string>} variables - Map of variable names to values
   * @returns {Array<{ prompt: string, appliedVars: Record<string, string> }>}
   */
  static expandPrompt(prompt, variables = {}) {
    if (!prompt || typeof prompt !== "string") return [];
    
    // Normalize variable dictionary keys to lowercase
    const normalizedVars = {};
    for (const [k, v] of Object.entries(variables || {})) {
      const list = Array.isArray(v) ? v : [String(v)];
      normalizedVars[k.toLowerCase()] = list.map(item => String(item).trim()).filter(Boolean);
    }

    const neededVars = this.extractVariableNames(prompt).filter(
      v => normalizedVars[v] && normalizedVars[v].length > 0
    );

    if (neededVars.length === 0) {
      return [{ prompt: prompt.trim(), appliedVars: {} }];
    }

    const valueArrays = neededVars.map(v => normalizedVars[v]);
    const combinations = this.cartesianProduct(valueArrays);

    return combinations.map(combo => {
      let expandedText = prompt;
      const applied = {};

      neededVars.forEach((varName, idx) => {
        const val = combo[idx];
        applied[varName] = val;
        
        // Replace all [varName] and {varName} case-insensitively
        const bracketPattern = new RegExp(`\\[${varName}\\]`, "gi");
        const bracePattern = new RegExp(`\\{${varName}\\}`, "gi");
        expandedText = expandedText.replace(bracketPattern, val).replace(bracePattern, val);
      });

      return {
        prompt: expandedText.trim(),
        appliedVars: applied
      };
    });
  }

  /**
   * Expand a list of prompts.
   * @param {string[]} prompts
   * @param {Record<string, string[]|string>} variables
   * @returns {Array<{ prompt: string, templateIndex: number, originalTemplate: string, appliedVars: Record<string, string> }>}
   */
  static expandBatch(prompts = [], variables = {}) {
    const results = [];
    const promptList = Array.isArray(prompts) ? prompts : [prompts];

    promptList.forEach((rawPrompt, templateIndex) => {
      const trimmed = String(rawPrompt || "").trim();
      if (!trimmed) return;

      const expanded = this.expandPrompt(trimmed, variables);
      expanded.forEach(item => {
        results.push({
          prompt: item.prompt,
          templateIndex,
          originalTemplate: trimmed,
          appliedVars: item.appliedVars
        });
      });
    });

    return results;
  }
}
