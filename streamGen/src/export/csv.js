import { computeOverlapSubLabels } from "../generators/labelGenerator.js";

export function shuffleByTick(pointClass) {
  const byTick = {};
  Object.entries(pointClass).forEach(([id, pt]) => {
    if(!byTick[pt.t]) byTick[pt.t] = [];
    byTick[pt.t].push([id, pt]);
  });
  return Object.keys(byTick)
    .map(Number).sort((a,b) => a-b)
    .flatMap(t => {
      const group = byTick[t];
      for(let i = group.length-1; i > 0; i--){
        const j = Math.floor(Math.random() * (i+1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      return group;
    });
}

export function splitEntries(entries, trainPct) {
  const n = Math.floor(entries.length * trainPct / 100);
  return { train: entries.slice(0, n), test: entries.slice(n) };
}

export function makeCSV(
  pointClass, trajs, numExtraFeatures, labelMode,
  globalSubLabels, globalActive, globalStrategy
) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);

  // ── Header columns ────────────────────────────────────────────────
  const labelCols = (() => {
    if(labelMode === 'multiclass') return ["label"];
    const cols = [];
    trajs.forEach((traj, ti) => {
      if(traj.labelConfig){
        const n = traj.labelConfig.subLabels;
        Array.from({length:n}, (_,i) => cols.push(`class_${ti}_${i+1}`));
      } else {
        cols.push(`class_${ti}`);
      }
    });
    return cols;
  })();

  const header = [
    "global_id","timestamp","f1","f2",
    ...extraCols,
    ...labelCols
  ].join(",");

  // ── Row builder ───────────────────────────────────────────────────
  const toRow = ([id,{x,y,extras,t,labels,srcTrajIdx,subLabels}]) => {
    const ev = Array.from({length:numExtraFeatures}, (_,i) =>
      (extras&&extras[i]!=null) ? Number(extras[i]).toFixed(6) : "0.000000"
    );

    const labelVals = (() => {
      if(labelMode === 'multiclass') return [labels.indexOf(1)];
      const vals = [];
      trajs.forEach((traj, ti) => {
        if(traj.labelConfig){
          const n = traj.labelConfig.subLabels;
          if(ti === srcTrajIdx && subLabels){
            Array.from({length:n}, (_,i) => vals.push(subLabels[i] ?? 0));
          } else if(labels[ti] === 1){
            const overlapSubs = computeOverlapSubLabels(
              traj, t, globalSubLabels, globalActive, globalStrategy
            );
            Array.from({length:n}, (_,i) => vals.push(overlapSubs?.[i] ?? 0));
          } else {
            Array.from({length:n}, () => vals.push(0));
          }
        } else {
          vals.push(labels[ti] ?? 0);
        }
      });
      return vals;
    })();

    return [id, t, x.toFixed(6), y.toFixed(6), ...ev, ...labelVals].join(",");
  };

  const shuffled = shuffleByTick(pointClass);
  const rows = shuffled.map(toRow);
  return [header, ...rows].join("\n");
}

export function splitCSV(csv, trainPct) {
  const lines = csv.split("\n");
  const header = lines[0];
  const rows = lines.slice(1).filter(r => r.trim());
  const n = Math.floor(rows.length * trainPct / 100);
  return {
    train: [header, ...rows.slice(0, n)].join("\n"),
    test:  [header, ...rows.slice(n)].join("\n"),
  };
}