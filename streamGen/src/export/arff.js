import { shuffleByTick, splitEntries } from "./csv.js";

export function makeARFF(pointClass, trajs, numExtraFeatures, labelMode) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);

  const labelAttrs = labelMode === 'multilabel'
    ? trajs.map((_, i) => `@attribute class_${i} {0,1}`)
    : [`@attribute label {${trajs.map((_,i)=>i).join(",")}}`];

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

  const toRow = ([id,{x,y,extras,t,labels}]) => {
    const ev = Array.from({length:numExtraFeatures}, (_,i) =>
      (extras&&extras[i]!=null) ? Number(extras[i]).toFixed(6) : "0.000000"
    );
    const labelVals = labelMode === 'multilabel'
      ? labels
      : [labels.indexOf(1)];
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