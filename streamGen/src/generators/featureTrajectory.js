// ─── generators/featureTrajectory.js ──────────────────────────────────────
// Logic for segmented, independent trajectories of disconnected extra
// features. Mirrors the centroid-interpolation logic used for main cluster
// segments in precompute.js, but scoped to a single feature ("fi-ti" key)
// instead of a full cluster.
// ────────────────────────────────────────────────────────────────────────


function interpolatePath(strokes, progress) {
  if (!strokes || strokes.length === 0) return null;

  const isFlat = strokes.length > 0 && typeof strokes[0].x === "number";
  const allPoints = isFlat ? strokes : strokes.flat();

  if (allPoints.length === 0) return null;
  if (allPoints.length === 1) return { x: allPoints[0].x, y: allPoints[0].y };

  const clamped = Math.max(0, Math.min(1, progress));
  const idx = Math.floor(clamped * (allPoints.length - 1));
  const w = clamped * (allPoints.length - 1) - idx;
  const a = allPoints[idx];
  const b = allPoints[Math.min(idx + 1, allPoints.length - 1)];

  return {
    x: a.x * (1 - w) + b.x * w,
    y: a.y * (1 - w) + b.y * w,
  };
}

function redistributeSegments(segments, startTime, endTime) {
  const n = segments.length;
  if (n === 0) return segments;
  const total = endTime - startTime;
  const slotSize = Math.floor(total / n);
  return segments.map((seg, i) => ({
    ...seg,
    tStart: startTime + i * slotSize,
    tEnd: i === n - 1 ? endTime : startTime + (i + 1) * slotSize - 1,
  }));
}


export function getFeatureCentroidAtTick(trajData, t) {
  if (!trajData || !trajData.segments || trajData.segments.length === 0) {
    return null;
  }

  const segments = trajData.segments;
  const active = segments.filter(s => s.tStart <= t && t <= s.tEnd);

  if (active.length === 0) {
    const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
    if (t < sorted[0].tStart) {
      return interpolatePath(sorted[0].path, 0);
    }
    const last = sorted[sorted.length - 1];
    if (t > last.tEnd) {
      return interpolatePath(last.path, 1);
    }
    return null;
  }

  const seg = active[0];
  const prog = (t - seg.tStart) / Math.max(1, seg.tEnd - seg.tStart);
  return interpolatePath(seg.path, prog);
}

export function addFeatureSegment(trajData, newPath, startTime, endTime) {
  const prevSegments = trajData?.segments ?? [];
  const newSegments = [
    ...prevSegments,
    { path: newPath, tStart: startTime, tEnd: endTime }, // overwritten by redistributeSegments
  ];
  return { segments: redistributeSegments(newSegments, startTime, endTime) };
}

export function removeFeatureSegment(trajData, segIdx, startTime, endTime) {
  if (!trajData?.segments) return null;
  const remaining = trajData.segments.filter((_, i) => i !== segIdx);
  if (remaining.length === 0) return null;
  return { segments: redistributeSegments(remaining, startTime, endTime) };
}

export function clearFeatureTrajectory() {
  return null;
}