// ─── utils/labelSpaceUtils.js ─────────────────────────────────────────────────
// Pure utility functions for Custom Label Space generation.
// Deterministic approach — no probability, explicit control over which
// sub-labels are active and how many, at every tick.
// No React dependencies — safe to use in precomputeData and export functions.

// ─── Index selection strategies ──────────────────────────────────────────────

/**
 * Selects which label indices are active given a strategy.
 *
 * @param {number} nTotal    - Total sub-labels in this cluster
 * @param {number} nActive   - How many sub-labels should be active
 * @param {string} strategy  - "first" | "last" | "both" | "random"
 * @returns {number[]} Sorted array of active label indices (length = nActive)
 */
export function selectActiveIndices(nTotal, nActive, strategy = "first") {
  const n = Math.min(Math.max(0, nActive), nTotal);
  if(n === 0) return [];
  if(n === nTotal) return Array.from({length: nTotal}, (_, i) => i);

  switch(strategy){
    case "first":
      return Array.from({length: n}, (_, i) => i);

    case "last":
      return Array.from({length: n}, (_, i) => nTotal - n + i);

    case "both": {
      const half = Math.floor(n / 2);
      const fromStart = Array.from({length: half}, (_, i) => i);
      const fromEnd   = Array.from({length: n - half}, (_, i) => nTotal - (n - half) + i);
      return [...fromStart, ...fromEnd];
    }

    case "random": {
      const all = Array.from({length: nTotal}, (_, i) => i);
      for(let i = all.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      return all.slice(0, n).sort((a, b) => a - b);
    }

    default:
      return Array.from({length: n}, (_, i) => i);
  }
}

// ─── Binary vector generation ─────────────────────────────────────────────────

/**
 * Generates a binary sub-label vector for a single instance.
 * Deterministic: always exactly nActive labels are set to 1.
 *
 * @param {number} nTotal    - Fixed vector size (max sub-labels for this cluster)
 * @param {number} nActive   - Exactly how many sub-labels are active
 * @param {string} strategy  - "first" | "last" | "both" | "random"
 * @returns {number[]} Binary vector of length nTotal
 */
export function generateSubLabelVector(nTotal, nActive, strategy = "end") {
  const active = new Array(nTotal).fill(0);
  const indices = selectActiveIndices(nTotal, nActive, strategy);
  indices.forEach(i => { active[i] = 1; });
  return active;
}

// ─── Temporal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the label space configuration active at tick t for a given cluster,
 * considering label space rules and per-cluster override.
 * Falls back to global defaults if no rule or override is found.
 *
 * @param {object} traj            - Cluster trajectory object
 * @param {number} t               - Current tick
 * @param {number} globalSubLabels - Global default total sub-labels
 * @param {number} globalActive    - Global default active sub-labels per instance
 * @param {string} globalStrategy  - Global default strategy
 * @returns {{ nTotal: number, nActive: number, strategy: string }}
 */
export function getLabelConfigAtTick(traj, t, globalSubLabels, globalActive, globalStrategy) {
  const base = {
    nTotal:   traj.labelConfig?.subLabels   ?? globalSubLabels,
    nActive:  traj.labelConfig?.activeLabels ?? globalActive,
    strategy: traj.labelConfig?.strategy    ?? globalStrategy,
  };

  const rule = (traj.labelSpaceRules ?? []).find(
    r => t >= r.tStart && t <= r.tEnd
  );

  if(!rule) return base;

  return {
    nTotal:   base.nTotal, 
    nActive:  rule.activeLabels ?? base.nActive,
    strategy: rule.strategy     ?? base.strategy,
  };
}

/**
 * Returns the maximum number of sub-labels that will ever be defined
 * for a given cluster. Used to determine the fixed column count in the export.
 *
 * @param {object} traj            - Cluster trajectory object
 * @param {number} globalSubLabels - Global default
 * @returns {number}
 */
export function getMaxSubLabels(traj, globalSubLabels) {
  return traj.labelConfig?.subLabels ?? globalSubLabels;
}

// ─── Attribution rule lookup ──────────────────────────────────────────────────

/**
 * Returns all attribution rules active at tick t for a given cluster.
 * Multiple rules may be active simultaneously (one per sub-label index).
 *
 * @param {object} traj - Cluster trajectory object
 * @param {number} t    - Current tick
 * @returns {object[]}  Active attribution rules at tick t
 */
export function getAttributionRulesAtTick(traj, t) {
  return (traj.attributionRules ?? []).filter(
    r => t >= r.tStart && t <= r.tEnd
  );
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a human-readable summary of the label space configuration
 * for a given cluster. Used in META.txt export.
 *
 * @param {object} traj            - Cluster trajectory object
 * @param {number} ti              - Cluster index
 * @param {number} globalSubLabels - Global default total sub-labels
 * @param {number} globalActive    - Global default active sub-labels
 * @param {string} globalStrategy  - Global default strategy
 * @returns {string}
 */
export function labelSpaceMetaSummary(traj, ti, globalSubLabels, globalActive, globalStrategy) {
  const nTotal   = traj.labelConfig?.subLabels    ?? globalSubLabels;
  const nActive  = traj.labelConfig?.activeLabels ?? globalActive;
  const strategy = traj.labelConfig?.strategy     ?? globalStrategy;
  const rules    = traj.labelSpaceRules ?? [];

  const lines = [
    `C${ti} label space:`,
    `  total sub-labels : ${nTotal}`,
    `  active per inst  : ${nActive}`,
    `  strategy         : ${strategy}`,
  ];

  if(rules.length > 0){
    lines.push(`  temporal rules   : ${rules.length}`);
    rules.forEach((r, ri) => {
      lines.push(
        `    rule ${ri+1}: t=${r.tStart}→${r.tEnd} · active=${r.activeLabels} · strategy=${r.strategy ?? strategy}`
      );
    });
  }

  return lines.join("\n");
}