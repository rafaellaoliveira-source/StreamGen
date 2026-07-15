import { shuffleByTick, splitEntries } from "./csv.js";
import { computeOverlapSubLabels } from "../generators/labelGenerator.js";

export function makeARFF(
  pointClass, trajs, numExtraFeatures, labelMode,
  globalSubLabels, globalActive, globalStrategy
) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);

  const labelAttrs = (() => {
    if(labelMode === 'multiclass')
      return [`@attribute label {${trajs.map((_,i)=>i).join(",")}}`];
    const attrs = [];
    trajs.forEach((traj, ti) => {
      if(traj.labelConfig){
        const n = traj.labelConfig.subLabels;
        Array.from({length:n}, (_,i) =>
          attrs.push(`@attribute class_${ti}_${i+1} {0,1}`)
        );
      } else {
        attrs.push(`@attribute class_${ti} {0,1}`);
      }
    });
    return attrs;
  })();

  const header = [
    "@relation stream_gen", "",
    "@attribute global_id NUMERIC",
    "@attribute timestamp NUMERIC",
    "@attribute f1 NUMERIC",
    "@attribute f2 NUMERIC",
    ...extraCols.map(col => `@attribute ${col} NUMERIC`),
    ...labelAttrs,
    "", "@data"
  ].join("\n");

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
  return header + "\n" + rows.join("\n");
}

export function splitARFF(arff, trainPct) {
  const lines = arff.split("\n");
  const dataIdx = lines.findIndex(l => l.trim().toLowerCase() === "@data");
  const header = lines.slice(0, dataIdx + 1).join("\n");
  const rows = lines.slice(dataIdx + 1).filter(r => r.trim());
  const n = Math.floor(rows.length * trainPct / 100);
  return {
    train: header + "\n" + rows.slice(0, n).join("\n"),
    test:  header + "\n" + rows.slice(n).join("\n"),
  };
}