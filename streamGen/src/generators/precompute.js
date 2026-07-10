import { boxMuller, gaussianPoints, rbfPoints } from "./gaussian.js";
import { getFeatureCentroidAtTick } from "./featureTrajectory.js";
import { computeStandardLabels, computeSubLabels, computeInstanceColor } from "./labelGenerator.js";


export function getCentroid(path, progress) {
  if(path.length===1) return path[0];
  const idx=Math.min(Math.floor(progress*(path.length-1)),path.length-2);
  const w=progress*(path.length-1)-idx;
  return {x:path[idx].x*(1-w)+path[idx+1].x*w, y:path[idx].y*(1-w)+path[idx+1].y*w};
}

export function getMoorePositions(n) {
  const positions = [];
  let border = 1;
  while(positions.length < n) {
    for(let i = -border; i <= border && positions.length < n; i++)
      positions.push([i, border]);
    for(let i = border-1; i >= -border && positions.length < n; i--)
      positions.push([border, i]);
    for(let i = border-1; i >= -border && positions.length < n; i--)
      positions.push([i, -border]);
    for(let i = -border+1; i < border && positions.length < n; i++)
      positions.push([-border, i]);
    border++;
  }
  return positions.slice(0, n);
}

export function precomputeData(trajs, {std, pts, distType, labelMode, mlRadius, numExtraFeatures, darkCanvas, featureStep, featureTransforms={}, featureTrajectories={}, disconnectedFeatures=new Set(), globalSubLabels=5, globalActive=3, globalStrategy="first"
}) {
  if (!trajs.length) return null;
  const gStart = Math.min(...trajs.map(t => t.startTime));
  const gEnd   = Math.max(...trajs.flatMap(t => t.segments.map(s => s.tEnd)));
  const dataPerTick = {}, pointClass = {};
  let gid = 0;

  const driftTicks = new Set();
  for (const traj of trajs) {
    for (let i = 1; i < traj.segments.length; i++) {
      const prev = traj.segments[i-1];
      const curr = traj.segments[i];
      if (curr.connected) continue;
      if (curr.tStart <= prev.tEnd) {
        for (let t = curr.tStart; t <= prev.tEnd; t++) driftTicks.add(t);
      } else {
        driftTicks.add(curr.tStart);
      }
    }
    if (traj.segments.length === 1 && traj.segments[0].type === 'free'
        && traj.segments[0].path.length > 1) {
      const seg = traj.segments[0];
      for (let t = seg.tStart; t <= seg.tEnd; t++) driftTicks.add(t);
    }
    for (let i = 0; i < traj.segments.length - 1; i++) {
      const segA = traj.segments[i];
      const segB = traj.segments[i + 1];
      if (segA.type === 'point' && segB.type === 'point' && segB.connected) {
        for (let t = segA.tEnd; t <= segB.tStart; t++) driftTicks.add(t);
      }
    }
  }

  const gen = (cx,cy,n) => distType==="RandomRBF" ? rbfPoints(cx,cy,std,n) : gaussianPoints(cx,cy,std,n);
  const MULTILABEL_COLOR = darkCanvas ? "#ffffff" : "#111111";
  const moorePositions = getMoorePositions(numExtraFeatures);

  for (let t = gStart; t <= gEnd; t++) {
    const allCentroids = trajs.map((traj) => {
      const activeSegs = traj.segments.filter(s => s.tStart <= t && t <= s.tEnd);

      if (!activeSegs.length) {
        for (let si = 0; si < traj.segments.length - 1; si++) {
          const segA = traj.segments[si];
          const segB = traj.segments[si + 1];
          if (segA.type==='point' && segB.type==='point' && segB.connected
              && segA.tEnd < t && t < segB.tStart) {
            const alpha = (t - segA.tEnd) / Math.max(1, segB.tStart - segA.tEnd);
            return {
              main: {
                x: segA.path[0].x*(1-alpha)+segB.path[0].x*alpha,
                y: segA.path[0].y*(1-alpha)+segB.path[0].y*alpha,
              }, secondary: null, alpha: 1
            };
          }
        }
        return null;
      }

      const getC = (seg) => {
        if (seg.type==='point') return seg.path[0];
        const prog = Math.max(0, Math.min(1, (t-seg.tStart)/Math.max(1, seg.tEnd-seg.tStart)));
        return getCentroid(seg.path, prog);
      };

      if (activeSegs.length === 1) {
        return {main: getC(activeSegs[0]), secondary: null, alpha: 1};
      } else {
        activeSegs.sort((a,b) => a.tStart-b.tStart);
        const segA = activeSegs[0], segB = activeSegs[1];
        if (segA.type==='point' && segB.type==='point' && segB.connected)
          return {main: getC(segA), secondary: null, alpha: 1};
        const zoneStart=segB.tStart, zoneEnd=segA.tEnd;
        const alpha = Math.max(0,Math.min(1,(t-zoneStart)/Math.max(1,zoneEnd-zoneStart)));
        return {main: getC(segA), secondary: getC(segB), alpha};
      }
    });

    const pointsT = [], centroidsT = [];
    const clusterPtsPerTraj = new Array(trajs.length).fill(pts);

    for (let ti = 0; ti < trajs.length; ti++) {
      const ac = allCentroids[ti];
      if (!ac) continue;
      centroidsT.push({x: ac.main.x, y: ac.main.y});

      const densityRules = trajs[ti].densityRules || [];
      const rule = densityRules.find(r => t >= r.tStart && t <= r.tEnd);
      const clusterPts = rule ? rule.pts : pts;
      clusterPtsPerTraj[ti] = clusterPts;

      const genWithExtras = (cx, cy, count, trajIdx) =>
        gen(cx, cy, count).map(pt => {
          const extras = moorePositions.map(([dx, dy], fi) => {
            const key = `${fi}-${trajIdx}`;
            const isDisconnected = disconnectedFeatures.has(key);
            const trajData = featureTrajectories[key];
            const indepPos = isDisconnected ? getFeatureCentroidAtTick(trajData, t) : null;

            if(indepPos){
              return Math.max(-1, Math.min(1, (indepPos.x + indepPos.y) / 2 + boxMuller() * std));
            }

            const tr = featureTransforms[fi]?.[trajIdx] ?? {factor:1, offsetX:0, offsetY:0};
            const fx = cx + dx * featureStep * tr.factor + (tr.offsetX ?? 0);
            const fy = cy + dy * featureStep * tr.factor + (tr.offsetY ?? 0);
            const raw = (fx + fy) / 2 + boxMuller() * std;
            return Math.max(-1, Math.min(1, raw));
          });
          return {...pt, extras, srcTrajIdx: trajIdx};
        });

      if (!ac.secondary) {
          genWithExtras(ac.main.x, ac.main.y, clusterPts, ti).forEach(pt => pointsT.push(pt));
      } else {
        const nB = Math.round(clusterPts*ac.alpha), nA = clusterPts-nB;
        if (nA>0) genWithExtras(ac.main.x, ac.main.y, nA, ti).forEach(pt => pointsT.push(pt));
        if (nB>0) genWithExtras(ac.secondary.x, ac.secondary.y, nB, ti).forEach(pt => pointsT.push(pt));
      }
    }

    if (!pointsT.length) continue;

    const numTrajs = trajs.length;
    const radius = mlRadius * std;
    const finalColors = [];

    const otherCentroids = labelMode === 'multilabel' ? [] : null;
    if(labelMode === 'multilabel'){
      for(let ti=0; ti<trajs.length; ti++){
        const ac = allCentroids[ti]; if(!ac) continue;
        otherCentroids.push({x:ac.main.x, y:ac.main.y, trajIdx:ti});
        if(ac.secondary) otherCentroids.push({x:ac.secondary.x, y:ac.secondary.y, trajIdx:ti});
      }
    }

    const instanceCountPerCluster = new Array(numTrajs).fill(0);

    for (let i=0; i<pointsT.length; i++) {
      const {x:px, y:py, extras, srcTrajIdx} = pointsT[i];
      const traj = trajs[srcTrajIdx];

      const labels = computeStandardLabels(
        srcTrajIdx, numTrajs, labelMode, px, py, otherCentroids, radius
      );

      const subLabels = computeSubLabels(
        traj, t, instanceCountPerCluster[srcTrajIdx],
        globalSubLabels, globalActive, globalStrategy, clusterPtsPerTraj[srcTrajIdx]
      );

      instanceCountPerCluster[srcTrajIdx]++;

      const color = computeInstanceColor(labels, subLabels, traj.color, MULTILABEL_COLOR);
      finalColors.push(color);
      pointClass[gid++] = {x:px, y:py, extras:extras||[], t, labels, srcTrajIdx, subLabels};
    }

    dataPerTick[t] = {points:pointsT, colors:finalColors, centroids:centroidsT};
  }

  return {gStart, gEnd, dataPerTick, pointClass, driftTicks};
}