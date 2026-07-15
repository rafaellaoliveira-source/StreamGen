// ─── utils/attributionUtils.js ───────────────────────────────────────────────
// Pure utility functions for controlling how many instances per tick
// receive each sub-label. Deterministic and fully user-controlled.
// No React dependencies — safe to use in precomputeData.

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Returns how many instances should receive a specific sub-label at tick t.
 *
 * If changePerTick is null/0 → fixed value throughout the interval.
 * If changePerTick is set    → linear transition starting from instances.
 *
 * Outside the interval: returns instances (fixed) or the clamped value (gradual).
 *
 * @param {object} rule
 * @param {number} rule.instances     - Base instance count (fixed or initial value)
 * @param {number|null} rule.changePerTick - Change per tick (null = fixed)
 * @param {number} rule.tStart        - First tick of the rule
 * @param {number} rule.tEnd          - Last tick of the rule
 * @param {number} rule.ptsPerTick    - Total instances per tick (ceiling)
 * @param {number} t                  - Current tick
 * @returns {number}
 */
export function getInstancesAtTick(rule, t) {
  const { instances, changePerTick, tStart, tEnd, ptsPerTick } = rule;

  // Fixed mode
  if(!changePerTick) return instances;

  // Gradual mode
  if(t < tStart) return instances;

  const ticksElapsed = t - tStart;
  const raw = instances + changePerTick * ticksElapsed;
  return Math.round(Math.max(0, Math.min(ptsPerTick ?? raw, raw)));
}

// ─── Transition helpers ───────────────────────────────────────────────────────

/**
 * Calculates how many ticks until the value reaches 0 or ptsPerTick
 * given a starting value and changePerTick.
 *
 * @param {number} instances     - Starting count
 * @param {number} changePerTick - Change per tick (positive = increasing)
 * @param {number} ptsPerTick    - Maximum instances per tick
 * @returns {number}
 */
export function calcTransitionDuration(instances, changePerTick, ptsPerTick) {
  if(!changePerTick || changePerTick === 0) return Infinity;
  if(changePerTick > 0){
    return Math.ceil((ptsPerTick - instances) / changePerTick);
  } else {
    return Math.ceil(instances / Math.abs(changePerTick));
  }
}

/**
 * Calculates changePerTick needed to go from instances to 0 or ptsPerTick
 * in exactly `duration` ticks.
 *
 * @param {number} instances  - Starting count
 * @param {number} ptsPerTick - Maximum instances per tick
 * @param {number} duration   - Number of ticks available
 * @param {"increase"|"decrease"} direction
 * @returns {number}
 */
export function calcChangePerTick(instances, ptsPerTick, duration, direction) {
  if(duration <= 0) return 0;
  const diff = direction === "increase"
    ? ptsPerTick - instances
    : instances;
  return Math.round((diff / duration) * 100) / 100;
}

// ─── Validation & inference ───────────────────────────────────────────────────

/**
 * Infers the drift type for a gradual attribution rule.
 *
 * @param {number} changePerTick  - Change per tick
 * @param {number} streamDuration - Total stream duration in ticks
 * @returns {{ type: string, color: string }}
 */
export function inferAttributionDriftType(changePerTick, streamDuration) {
  if(!changePerTick) return { type: "Fixed", color: "#94a3b8" };

  const absChange = Math.abs(changePerTick);
  if(absChange >= 10)
    return { type: "Abrupt", color: "#f87171" };
  if(absChange >= Math.round(streamDuration * 0.05))
    return { type: "Too fast", color: "#f97316" };
  return { type: "Incremental", color: "#60a5fa" };
}

/**
 * Validates an attribution rule and returns warning messages.
 *
 * @param {object} rule
 * @param {number} ptsPerTick     - Global instances per centroid
 * @param {Array}  validIntervals - [{tStart, tEnd}] from cluster segments
 * @returns {string[]}
 */
export function validateAttributionRule(rule, ptsPerTick, validIntervals) {
  const warnings = [];
  const { instances, changePerTick, tStart, tEnd } = rule;

  // ── Instance range ────────────────────────────────────────────────
  if(instances < 0 || instances > ptsPerTick)
    warnings.push(`Instances must be between 0 and ${ptsPerTick}.`);

  // ── Temporal ──────────────────────────────────────────────────────
  if(tStart >= tEnd)
    warnings.push("t start must be less than t end.");
  const inValidInterval = validIntervals.some(
    iv => tStart >= iv.tStart && tEnd <= iv.tEnd
  );
  if(!inValidInterval)
    warnings.push(`Range t=${tStart}→${tEnd} must be within cluster segments.`);

  // ── Transition (only if gradual) ──────────────────────────────────
  if(changePerTick){
    if(changePerTick === 0)
      warnings.push("Change per tick must be non-zero if gradual mode is used.");
  }

  return warnings;
}

/**
 * Applies attribution rules to a sub-label vector for a specific instance.
 * Each rule limits how many instances receive its sub-label per tick.
 *
 * Fixed rules:   active for first N instances (instances = N)
 * Gradual rules: active for first N instances where N changes over time
 *
 * @param {number[]} subLabels   - Binary sub-label vector
 * @param {object[]} activeRules - Rules with pre-calculated currentInstances
 * @param {number}   instanceIdx - 0-based index within the tick
 * @returns {number[]}
 */
export function applyAttributionRules(subLabels, activeRules, instanceIdx) {
  if(!activeRules.length) return subLabels;
  const result = [...subLabels];
  activeRules.forEach(rule => {
    const limit = rule.currentInstances;
    const idx = rule.subLabelIndex - 1;
    if(idx < 0 || idx >= result.length) return;
    // Primeiras N instâncias recebem o sub-label
    result[idx] = instanceIdx < limit ? result[idx] : 0;
  });
  return result;
}

// ─── Meta summary ─────────────────────────────────────────────────────────────

/**
 * Returns a human-readable summary of attribution rules for META.txt.
 *
 * @param {object} traj - Cluster trajectory object
 * @param {number} ti   - Cluster index
 * @returns {string}
 */
export function attributionRulesMetaSummary(traj, ti) {
  const rules = traj.attributionRules ?? [];
  if(rules.length === 0) return "";

  const lines = [`C${ti} attribution rules: ${rules.length}`];
  rules.forEach((r, ri) => {
    const gradual = r.changePerTick
      ? ` · ${r.changePerTick > 0 ? "+" : ""}${r.changePerTick}/tick`
      : " · fixed";
    lines.push(
      `  rule ${ri+1}: class_${ti}_${r.subLabelIndex} · ` +
      `t=${r.tStart}→${r.tEnd} · ` +
      `${r.instances} inst${gradual}`
    );
  });
  return lines.join("\n");
}