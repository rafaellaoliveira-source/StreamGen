// ─── generators/labelGenerator.js ────────────────────────────────────────────
// Encapsulates all label generation logic extracted from precomputeData.
// Handles both standard multilabel/multiclass and custom label space (XML).
// No React dependencies.

import { getLabelConfigAtTick, generateSubLabelVector, getAttributionRulesAtTick } from "../utils/labelSpaceUtils.js";
import { getInstancesAtTick, applyAttributionRules } from "../utils/attributionUtils.js";

// ─── Standard label computation ───────────────────────────────────────────────

/**
 * Computes the standard binary label vector for a single instance.
 * Handles multiclass (one-hot) and multilabel (with spatial overlap).
 *
 * @param {number}   srcTrajIdx     - Index of the cluster this instance belongs to
 * @param {number}   numTrajs       - Total number of clusters
 * @param {string}   labelMode      - "multiclass" | "multilabel"
 * @param {number}   px             - Instance x position
 * @param {number}   py             - Instance y position
 * @param {object[]} otherCentroids - [{x, y, trajIdx}] all active centroids
 * @param {number}   radius         - Overlap radius (mlRadius * std)
 * @returns {number[]} Binary label vector of length numTrajs
 */
export function computeStandardLabels(
  srcTrajIdx, numTrajs, labelMode, px, py, otherCentroids, radius
) {
  const labels = new Array(numTrajs).fill(0);
  labels[srcTrajIdx] = 1;

  if(labelMode === 'multilabel' && otherCentroids){
    for(const oc of otherCentroids){
      if(oc.trajIdx === srcTrajIdx) continue;
      const dx = px - oc.x;
      const dy = py - oc.y;
      if(Math.sqrt(dx*dx + dy*dy) <= radius) labels[oc.trajIdx] = 1;
    }
  }

  return labels;
}

// ─── Custom label space computation ───────────────────────────────────────────

/**
 * Computes the sub-label vector for a cluster with custom label space (labelConfig).
 * Returns null if the cluster has no labelConfig.
 *
 * Applies:
 * 1. Label space rules — how many sub-labels are active and which strategy
 * 2. Attribution rules — how many instances per tick receive each sub-label
 *
 * @param {object} traj            - Cluster trajectory object
 * @param {number} t               - Current tick
 * @param {number} instanceIdx     - 0-based index of this instance within the tick
 * @param {number} globalSubLabels - Global default total sub-labels
 * @param {number} globalActive    - Global default active sub-labels per instance
 * @param {string} globalStrategy  - Global default strategy
 * @returns {number[]|null} Sub-label binary vector, or null if no labelConfig
 */
export function computeSubLabels(
  traj, t, instanceIdx,
  globalSubLabels, globalActive, globalStrategy,
  ptsPerTick
) {
  if(!traj.labelConfig) return null;

  const { nTotal, nActive, strategy } = getLabelConfigAtTick(
    traj, t, globalSubLabels, globalActive, globalStrategy
  );

  let subLabels = generateSubLabelVector(nTotal, nActive, strategy);

  const activeAttrRules = getAttributionRulesAtTick(traj, t);

  const pastAttrRules = (traj.attributionRules ?? []).filter(r => t > r.tEnd);

  const rulesWithLimits = [
    ...activeAttrRules.map(r => ({
      ...r,
      currentInstances: getInstancesAtTick(r, t),
      ptsPerTick,
    })),
    ...pastAttrRules.map(r => ({
      ...r,
      currentInstances: r.finalInstances, 
      ptsPerTick,
    })),
  ];

  if(rulesWithLimits.length > 0){
    subLabels = applyAttributionRules(subLabels, rulesWithLimits, instanceIdx);
  }

  return subLabels;
}

// ─── Instance color ───────────────────────────────────────────────────────────

/**
 * Returns the color for an instance based on how many labels are active.
 * Multi-label instances (overlap) get a special neutral color.
 *
 * @param {number[]} labels         - Standard label vector
 * @param {number[]|null} subLabels - Sub-label vector (if custom label space)
 * @param {string}  clusterColor    - The source cluster's color
 * @param {string}  multilabelColor - Color for overlapping instances
 * @returns {string} CSS color string
 */
export function computeInstanceColor(labels, subLabels, clusterColor, multilabelColor) {
  const activeLabels = labels.reduce((a, b) => a + b, 0);
  return activeLabels > 1 ? multilabelColor : clusterColor;
}