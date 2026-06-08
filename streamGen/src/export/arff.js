import { shuffleByTick, splitEntries } from "./csv.js";

export function makeARFF(pointClass, trajs, numExtraFeatures, trainPct) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);

  const makeHeader = () => {
    const lines = [];
    lines.push("@relation stream_gen");
    lines.push("");
    lines.push("@attribute global_id NUMERIC");
    lines.push("@attribute timestamp NUMERIC");
    lines.push("@attribute f1 NUMERIC");
    lines.push("@attribute f2 NUMERIC");
    extraCols.forEach(col => lines.push(`@attribute ${col} NUMERIC`));
    trajs.forEach((_, i) => lines.push(`@attribute class_${i} {0,1}`));
    lines.push("");
    lines.push("@data");
    return lines;
  };

  const toRow = ([id,{x,y,extras,t,labels}]) => {
    const ev = Array.from({length:numExtraFeatures}, (_,i) =>
      (extras&&extras[i]!=null) ? Number(extras[i]).toFixed(6) : "0.000000"
    );
    return [id, t, x.toFixed(6), y.toFixed(6), ...ev, ...labels].join(",");
  };

  const shuffled = shuffleByTick(pointClass);
  const {train, test} = splitEntries(shuffled, trainPct);

  return {
    train:    [...makeHeader(), ...train.map(toRow)].join("\n"),
    test:     [...makeHeader(), ...test.map(toRow)].join("\n"),
    complete: [...makeHeader(), ...shuffled.map(toRow)].join("\n"),
  };
}
