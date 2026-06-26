import { boxMuller } from "./gaussian.js";

export function generateHyperplane({
  nFeatures      = 2,
  nDriftFeatures = 2,
  magChange      = 0.0,
  noisePerc      = 0.05,
  sigma          = 0.1,
  pts            = 100,
  tStart         = 1,
  tEnd           = 1000,
}) {
  const weights = Array.from({length: nFeatures}, () => Math.random());
  const directions = Array.from({length: nFeatures}, () => Math.random() > 0.5 ? 1 : -1);

  const dataPerTick = {}, pointClass = {};
  let gid = 0;
  const driftTicks = new Set();

  for (let t = tStart; t <= tEnd; t++) {
    const w0 = weights.reduce((a, b) => a + b, 0);
    const pointsT = [], colorsT = [];

    for (let i = 0; i < pts; i++) {
      
      const features = Array.from({length: nFeatures}, () => Math.random());

      
      const sum = features.reduce((acc, xi, idx) => acc + weights[idx] * xi, 0);
      let label = sum > w0 ? 1 : 0;

      
      if (Math.random() < noisePerc) label = 1 - label;

      
      const x = features[0] * 2 - 1;
      const y = features[1] * 2 - 1;

      colorsT.push(label === 1 ? "#4e9af1" : "#e05c5c");
      pointsT.push({x, y, extras: features.slice(2), srcTrajIdx: 0});
      pointClass[gid++] = {x, y, extras: features.slice(2), t, labels: [label]};
    }

    dataPerTick[t] = {
      points: pointsT,
      colors: colorsT,
      centroids: [],
      weights: [...weights],
      w0,
    };

  
    for (let fi = 0; fi < nDriftFeatures; fi++) {
      if (Math.random() < sigma) directions[fi] *= -1;
      weights[fi] += directions[fi] * magChange;
      weights[fi] = Math.max(0, Math.min(1, weights[fi]));
    }

    if (magChange > 0) driftTicks.add(t);
  }

  return {gStart: tStart, gEnd: tEnd, dataPerTick, pointClass, driftTicks};
}