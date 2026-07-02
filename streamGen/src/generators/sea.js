const SEA_THRESHOLDS = [8, 9, 7, 9.5];

export function generateSEA({
  variant    = 0,
  noise      = 0.0,
  pts        = 100,
  tStart     = 1,
  tEnd       = 1000,
  driftTicks = [], 
}) {
  const dataPerTick = {}, pointClass = {};
  let gid = 0;
  const driftTicksSet = new Set();

  
  const schedule = [...driftTicks].sort((a, b) => a.t - b.t);
  let currentVariant = variant;

  for (let t = tStart; t <= tEnd; t++) {
   
    const change = schedule.find(d => d.t === t);
    if (change) {
      currentVariant = change.variant;
      driftTicksSet.add(t);
    }

    const threshold = SEA_THRESHOLDS[currentVariant];
    const pointsT = [], colorsT = [];

    for (let i = 0; i < pts; i++) {
      const att1 = Math.random() * 10;
      const att2 = Math.random() * 10;
      const att3 = Math.random() * 10; // irrelevant

      let label = (att1 + att2 > threshold) ? 1 : 0;
      if (Math.random() < noise) label = 1 - label;

      // Map att1, att2 to [-1, 1] for visualization
      const x = (att1 / 10) * 2 - 1;
      const y = (att2 / 10) * 2 - 1;

      colorsT.push(label === 1 ? "#4e9af1" : "#e05c5c");
      pointsT.push({x, y, extras: [att3], srcTrajIdx: 0});
      pointClass[gid++] = {x, y, extras: [att3], t, labels: [label]};
    }

    dataPerTick[t] = {
      points: pointsT,
      colors: colorsT,
      centroids: [],
      threshold,
      variant: currentVariant,
    };
  }

  return {gStart: tStart, gEnd: tEnd, dataPerTick, pointClass, driftTicks: driftTicksSet};
}

export { SEA_THRESHOLDS };