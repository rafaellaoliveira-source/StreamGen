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
export function makeCSV(pointClass, trajs, numExtraFeatures, trainPct) {
  const extraCols = Array.from({length:numExtraFeatures}, (_,i) => `f${i+3}`);
  const header = [
    "global_id","timestamp","f1","f2",
    ...extraCols,
    ...trajs.map((_,i)=>`class_${i}`)
  ].join(",");

  const toRow = ([id,{x,y,extras,t,labels}]) => {
    const ev = Array.from({length:numExtraFeatures}, (_,i) =>
      (extras&&extras[i]!=null) ? Number(extras[i]).toFixed(6) : "0.000000"
    );
    return [id, t, x.toFixed(6), y.toFixed(6), ...ev, ...labels].join(",");
  };

  const shuffled = shuffleByTick(pointClass);
  const {train, test} = splitEntries(shuffled, trainPct);

  return {
    train:    [header, ...train.map(toRow)].join("\n"),
    test:     [header, ...test.map(toRow)].join("\n"),
    complete: [header, ...shuffled.map(toRow)].join("\n"),
  };
}