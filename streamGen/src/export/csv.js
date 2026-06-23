// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── CSV ──────────────────────────────────────────────────────────────────────
// ─── CSV ──────────────────────────────────────────────────────────────────────
export function makeCSV(pointClass, trajs, numExtraFeatures, labelMode) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);
  const labelCols = labelMode === 'multilabel'
    ? trajs.map((_,i)=>`class_${i}`)
    : ["label"];

  const header = [
    "global_id","timestamp","f1","f2",
    ...extraCols,
    ...labelCols
  ].join(",");

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