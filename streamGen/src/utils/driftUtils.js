// ─── utils/driftUtils.js ─────────────────────────────────────────────────────
// Pure utility functions for drift type inference and styling.
// No React dependencies — safe to use outside components.

/**
 * Infers the drift type from the current segment configuration.
 *
 * @param {boolean} hasMultipleSegs - Whether there are 2+ segments under construction
 * @param {Array}   currentSegments - The segments currently being drawn
 * @param {number}  overlapDur      - The transition duration (0 = abrupt)
 * @param {boolean} overlapIsTooShort - Whether the overlap is below the recommended minimum
 * @returns {string} One of: "Incremental" | "Stationary" | "Abrupt" | "Gradual" | "Too short for Gradual"
 */
export function inferDriftType(hasMultipleSegs, currentSegments, overlapDur, overlapIsTooShort) {
  if (!hasMultipleSegs) {
    return currentSegments[0]?.type === "free" ? "Incremental" : "Stationary";
  }
  if (overlapDur === 0) return "Abrupt";
  if (overlapIsTooShort) return "Too short for Gradual";
  return "Gradual";
}

/**
 * Maps a drift type string to its display color.
 */
export const DRIFT_TYPE_COLORS = {
  "Abrupt":               "#f87171",
  "Gradual":              "#4ade80",
  "Too short for Gradual":"#f97316",
  "Stationary":           "#94a3b8",
  "Incremental":          "#60a5fa",
};

/**
 * Convenience helper — returns the color for a given drift type,
 * falling back to a neutral gray if the type is unrecognized.
 */
export function getDriftTypeColor(inferredType) {
  return DRIFT_TYPE_COLORS[inferredType] ?? "#94a3b8";
}