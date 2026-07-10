import { labelSpaceMetaSummary } from "../utils/labelSpaceUtils.js";
import { attributionRulesMetaSummary } from "../utils/attributionUtils.js";

export function makeMetaTXT(
  trajs, driftTicks, numExtraFeatures, trainPct,
  labelMode, pointClass,
  globalSubLabels = 1, globalActive = 1, globalStrategy = "first"
) {
  const totalInstances = pointClass ? Object.keys(pointClass).length : 0;
  const trainInstances = Math.floor(totalInstances * trainPct / 100);
  const testInstances  = totalInstances - trainInstances;
  const multiLabelInstances = pointClass
    ? Object.values(pointClass).filter(p => p.labels.reduce((a,b)=>a+b,0) > 1).length
    : 0;

  const hasCustomLabelSpace = trajs.some(t => t.labelConfig);

  const lines = [];
  lines.push("=== StreamGen Dataset Metadata ===");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Label mode: ${labelMode === 'multilabel' ? 'Multi-label' : 'Multiclass'}`);
  if(hasCustomLabelSpace){
    lines.push(`Custom label space: enabled (per-cluster configuration)`);
    lines.push(`Global defaults: ${globalSubLabels} sub-labels · ${globalActive} active · strategy=${globalStrategy}`);
  }
  lines.push(`Total clusters: ${trajs.length}`);
  lines.push(`Extra features: ${numExtraFeatures} (f3…f${numExtraFeatures+2})`);
  lines.push(`Total instances: ${totalInstances.toLocaleString()}`);
  lines.push(`Train instances: ${trainInstances.toLocaleString()} (${trainPct}%)`);
  lines.push(`Test instances:  ${testInstances.toLocaleString()} (${100-trainPct}%)`);
  lines.push(`Train split: ${trainPct}%`);
  lines.push(`Test split: ${100-trainPct}%`);
  lines.push("");

  trajs.forEach((traj, i) => {
    const generated = pointClass
      ? Object.values(pointClass).filter(p => p.srcTrajIdx === i).length
      : 0;
    const withLabel = pointClass
      ? Object.values(pointClass).filter(p => p.labels[i] === 1).length
      : 0;

    lines.push(`--- Cluster ${i} ---`);
    lines.push(`Color: ${traj.color}`);
    lines.push(`Total instances: ${generated.toLocaleString()}`);
    lines.push(`Labeling Rate (class_${i}): ${withLabel.toLocaleString()}`);
    if(labelMode === 'multilabel'){
      lines.push(`Multi-label instances: ${multiLabelInstances.toLocaleString()}`);
    }

    const segStart = Math.min(...traj.segments.map(s => s.tStart));
    const segEnd   = Math.max(...traj.segments.map(s => s.tEnd));
    lines.push(`Duration: ${segStart} - ${segEnd}`);
    lines.push(`Segments: ${traj.segments.length}`);

    traj.segments.forEach((seg, si) => {
      lines.push(`  Segment ${si+1}: type=${seg.type} | t=${seg.tStart}→${seg.tEnd}`);
    });

    const clusterDriftTicks = [];
    for(const t of driftTicks){
      const inSegment = traj.segments.some(s => t >= s.tStart && t <= s.tEnd);
      if(inSegment) clusterDriftTicks.push(t);
    }

    if(clusterDriftTicks.length > 0){
      const driftStart = Math.min(...clusterDriftTicks);
      const driftEnd   = Math.max(...clusterDriftTicks);
      lines.push(`  Drift start: ${driftStart}`);
      lines.push(`  Drift end:   ${driftEnd}`);
      lines.push(`  Drift duration: ${driftEnd - driftStart + 1} ticks`);
    } else {
      lines.push(`  Drift: none detected`);
    }

    if(traj.densityRules?.length > 0){
      lines.push(`  Frequency rules:`);
      traj.densityRules.forEach(r => {
        lines.push(`    t=${r.tStart}→${r.tEnd}: ${r.pts} inst/tick`);
      });
    } else {
      lines.push(`  Frequency: global default`);
    }

    if(traj.labelConfig){
      const summary = labelSpaceMetaSummary(
        traj, i, globalSubLabels, globalActive, globalStrategy
      );
      summary.split("\n").forEach(l => lines.push(`  ${l}`));
    }

    if(traj.attributionRules?.length > 0){
      const attrSummary = attributionRulesMetaSummary(traj, i);
      attrSummary.split("\n").forEach(l => lines.push(`  ${l}`));
    }

    lines.push("");
  });

  return lines.join("\n");
}