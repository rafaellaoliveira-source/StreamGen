export function inferDriftType(hasMultipleSegs, currentSegments, overlapDur, overlapIsTooShort) {
  if (!hasMultipleSegs) {
    return currentSegments[0]?.type === "free" ? "Incremental" : "Stationary";
  }
  if (overlapDur === 0) return "Abrupt";
  if (overlapIsTooShort) return "Too short for Gradual";
  return "Gradual";
}

export const DRIFT_TYPE_COLORS = {
  "Abrupt":               "#f87171",
  "Gradual":              "#4ade80",
  "Too short for Gradual":"#f97316",
  "Stationary":           "#94a3b8",
  "Incremental":          "#60a5fa",
};

export function getDriftTypeColor(inferredType) {
  return DRIFT_TYPE_COLORS[inferredType] ?? "#94a3b8";
}