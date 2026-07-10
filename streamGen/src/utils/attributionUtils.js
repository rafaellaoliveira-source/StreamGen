// ─── utils/attributionUtils.js ───────────────────────────────────────────────
// Pure utility functions for controlling how many instances per tick
// receive each sub-label. Deterministic and fully user-controlled.
// No React dependencies — safe to use in precomputeData.

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Returns how many instances should receive a specific sub-label at tick t,
 * given an attribution rule.
 *
 * The value transitions linearly from `initialInstances` to `finalInstances`
 * at a rate of `changePerTick` per tick, clamped to the valid range.
 *
 * @param {object} rule - Attribution rule
 * @param {number} rule.initialInstances - Attributions at tStart
 * @param {number} rule.finalInstances   - Attributions at tEnd
 * @param {number} rule.changePerTick    - How much the count changes per tick
 * @param {number} rule.tStart           - First tick of the transition
 * @param {number} rule.tEnd             - Last tick of the transition
 * @param {number} t                     - Current tick
 * @returns {number} Number of instances that should receive this sub-label
 */
export function getInstancesAtTick(rule, t) {
  const { initialInstances, finalInstances, changePerTick, tStart, tEnd } = rule;

  if(t < tStart) return initialInstances;
  if(t > tEnd)   return finalInstances;

  const ticksElapsed = t - tStart;
  const direction = finalInstances >= initialInstances ? 1 : -1;
  const raw = initialInstances + direction * changePerTick * ticksElapsed;

  // Clamp to [min, max] of initial and final
  const lo = Math.min(initialInstances, finalInstances);
  const hi = Math.max(initialInstances, finalInstances);
  return Math.round(Math.max(lo, Math.min(hi, raw)));
}

/**
 * Calculates tStart and tEnd for an attribution rule centered on the
 * cluster midpoint, given initial, final and changePerTick values.
 * Mirrors the overlapDur behavior from the main canvas.
 *
 * @param {number} initial       - Starting attribution count
 * @param {number} final         - Ending attribution count
 * @param {number} changePerTick - Change per tick
 * @param {number} midpoint      - Center tick (usually (segStart + segEnd) / 2)
 * @returns {{ tStart: number, tEnd: number, duration: number }}
 */
export function calcStartEndFromMidpoint(initial, final, changePerTick, midpoint) {
  const duration = calcTransitionDuration(initial, final, changePerTick);
  const half = Math.floor(duration / 2);
  return {
    tStart: midpoint - half,
    tEnd:   midpoint - half + duration,
    duration,
  };
}

// ─── Transition helpers ───────────────────────────────────────────────────────

/**
 * Calculates how many ticks the transition takes given initial, final
 * and changePerTick values.
 *
 * @param {number} initial       - Starting attribution count
 * @param {number} final         - Ending attribution count
 * @param {number} changePerTick - Change per tick (must be > 0)
 * @returns {number} Number of ticks needed (minimum 1)
 */
export function calcTransitionDuration(initial, final, changePerTick) {
  if(changePerTick <= 0) return Infinity;
  const diff = Math.abs(final - initial);
  if(diff === 0) return 0;
  return Math.ceil(diff / changePerTick);
}

/**
 * Calculates changePerTick needed to go from initial to final in exactly
 * `duration` ticks.
 *
 * @param {number} initial  - Starting attribution count
 * @param {number} final    - Ending attribution count
 * @param {number} duration - Number of ticks available
 * @returns {number} Change per tick (rounded to 2 decimal places)
 */
export function calcChangePerTick(initial, final, duration) {
  if(duration <= 0) return Math.abs(final - initial);
  const diff = Math.abs(final - initial);
  return Math.round((diff / duration) * 100) / 100;
}

// ─── Validation & inference ───────────────────────────────────────────────────

/**
 * Infers the drift type based on how fast the transition is relative to
 * the stream duration.
 *
 * @param {number} initial        - Starting attribution count
 * @param {number} final          - Ending attribution count
 * @param {number} changePerTick  - Change per tick
 * @param {number} streamDuration - Total stream duration in ticks
 * @returns {{ type: string, color: string }}
 */
export function inferAttributionDriftType(initial, final, changePerTick, streamDuration) {
  const diff = Math.abs(final - initial);
  if(diff === 0) return { type: "Stationary", color: "#94a3b8" };

  const duration = calcTransitionDuration(initial, final, changePerTick);

  if(duration <= 1)
    return { type: "Abrupt", color: "#f87171" };
  if(duration <= Math.max(2, Math.round(streamDuration * 0.05)))
    return { type: "Too fast", color: "#f97316" };
  return { type: "Gradual", color: "#4ade80" };
}

/**
 * Validates an attribution rule and returns an array of warning/error messages.
 * Returns an empty array if the rule is valid.
 *
 * @param {object} rule            - Attribution rule to validate
 * @param {number} ptsPerTick      - Global instances per centroid
 * @param {number} streamDuration  - Total stream duration
 * @param {Array}  validIntervals  - [{tStart, tEnd}] from cluster segments
 * @returns {string[]} Array of warning messages (empty if valid)
 */
export function validateAttributionRule(rule, ptsPerTick, streamDuration, validIntervals) {
  const warnings = [];
  const { initialInstances, finalInstances, changePerTick, tStart, tEnd } = rule;

  // Check instances are within valid range
  if(initialInstances < 0 || initialInstances > ptsPerTick)
    warnings.push(`Initial must be between 0 and ${ptsPerTick} (instances per tick).`);
  if(finalInstances < 0 || finalInstances > ptsPerTick)
    warnings.push(`Final must be between 0 and ${ptsPerTick} (instances per tick).`);

  // Check tStart/tEnd are within valid cluster intervals
  const inValidInterval = validIntervals.some(
    iv => tStart >= iv.tStart && tEnd <= iv.tEnd
  );
  if(!inValidInterval)
    warnings.push(`Range t=${tStart}→${tEnd} must be within cluster segments.`);

  if(tStart >= tEnd)
    warnings.push("t start must be less than t end.");

  if(changePerTick <= 0)
    warnings.push("Change per tick must be greater than 0.");

  const diff = Math.abs(finalInstances - initialInstances);
  const duration = tEnd - tStart;
  const totalChange = changePerTick * duration;

  if(diff > 0 && totalChange < diff)
    warnings.push(
      `Change per tick too small — needs ${Math.ceil(diff / duration)} per tick ` +
      `to reach final value in ${duration} ticks.`
    );

  if(diff > 0 && duration <= 1)
    warnings.push("Transition too short — consider increasing duration for gradual drift.");

  return warnings;
}

/**
 * Applies attribution rules to a sub-label vector for a specific instance.
 *
 * - Decreasing rules: sub-label is active for the first N instances
 * - Increasing rules: sub-label is active for the last N instances
 *
 * @param {number[]} subLabels    - Binary sub-label vector
 * @param {object[]} activeRules  - Attribution rules active at this tick
 *                                  (each must have currentInstances and ptsPerTick)
 * @param {number}   instanceIdx  - 0-based index of this instance within the tick
 * @returns {number[]} Modified sub-label vector
 */
export function applyAttributionRules(subLabels, activeRules, instanceIdx) {
  if(!activeRules.length) return subLabels;
  const result = [...subLabels];
  activeRules.forEach(rule => {
    const limit = rule.currentInstances;
    const idx = rule.subLabelIndex - 1;
    if(idx < 0 || idx >= result.length) return;

    const isDecreasing = rule.finalInstances < rule.initialInstances;

    if(isDecreasing){
      result[idx] = instanceIdx < limit ? result[idx] : 0;
    } else {
      const threshold = rule.ptsPerTick - limit;
      result[idx] = instanceIdx >= threshold ? result[idx] : 0;
    }
  });
  return result;
}

// ─── Meta summary ─────────────────────────────────────────────────────────────

/**
 * Returns a human-readable summary of all attribution rules for a cluster.
 * Used in META.txt export.
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
    const duration = calcTransitionDuration(r.initialInstances, r.finalInstances, r.changePerTick);
    lines.push(
      `  rule ${ri+1}: class_${ti}_${r.subLabelIndex} · ` +
      `t=${r.tStart}→${r.tEnd} · ` +
      `${r.initialInstances}→${r.finalInstances} inst · ` +
      `${r.changePerTick}/tick · ` +
      `duration=${duration} ticks`
    );
  });
  return lines.join("\n");
}