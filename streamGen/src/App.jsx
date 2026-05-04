import { useState, useRef, useEffect, useCallback } from "react";

const CLUSTER_COLORS = ["#e05c5c","#4e9af1","#4ec994","#f5a623","#b36fd6","#f06c9b","#00c9c9","#d4b44a"];
const FEATURE_COLORS = ["#f5a623","#a78bfa","#34d399","#f472b6","#60a5fa","#fb923c","#a3e635","#e879f9","#67e8f9","#fde68a"];
const GRID_SIZE = 100;
const randomColor  = (idx) => CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
const featureColor = (fi)  => FEATURE_COLORS[fi  % FEATURE_COLORS.length];

function boxMuller() {
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function gaussianPoints(cx,cy,std,n) {
  return Array.from({length:n},()=>({
    x:Math.max(-1,Math.min(1,cx+boxMuller()*std)),
    y:Math.max(-1,Math.min(1,cy+boxMuller()*std))
  }));
}
function rbfPoints(cx,cy,s,n) {
  return Array.from({length:n},()=>{
    const r=Math.random()*s*2, t=Math.random()*2*Math.PI;
    return {x:Math.max(-1,Math.min(1,cx+r*Math.cos(t))),y:Math.max(-1,Math.min(1,cy+r*Math.sin(t)))};
  });
}
function getCentroid(path,progress) {
  if(path.length===1) return path[0];
  const idx=Math.min(Math.floor(progress*(path.length-1)),path.length-2);
  const w=progress*(path.length-1)-idx;
  return {x:path[idx].x*(1-w)+path[idx+1].x*w, y:path[idx].y*(1-w)+path[idx+1].y*w};
}

// ─── Pré-cálculo ──────────────────────────────────────────────────────────────
// numExtraFeatures: número global de features extras (mesmo para todos os clusters)
function precomputeData(trajs, {std, pts, distType, labelMode, mlRadius, numExtraFeatures, darkCanvas}) {
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

  // Extra Features grid
  const GRID_RES = 100; 
  const featureGrids = Array.from({length: numExtraFeatures}, () => {
    const grid = [];
    for(let i = 0; i < GRID_RES; i++){
      grid.push(Array.from({length: GRID_RES}, () => boxMuller() * std));
    }
    return grid;
  });

  const toGrid = (v) => Math.min(GRID_RES-1, Math.max(0,
    Math.floor((v + 1) / 2 * GRID_RES)
  ));

  const neighborSum = (grid, ci, cj) => {
    let sum = 0;
    for(let a = -1; a <= 1; a++){
      for(let b = -1; b <= 1; b++){
        if(a === 0 && b === 0) continue;
        const ni = ci + a, nj = cj + b;
        if(ni >= 0 && ni < GRID_RES && nj >= 0 && nj < GRID_RES){
          sum += grid[ni][nj];
        }
      }
    }
    return sum;
  };

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

    for (let ti = 0; ti < trajs.length; ti++) {
      const ac = allCentroids[ti];
      if (!ac) continue;
      centroidsT.push({x: ac.main.x, y: ac.main.y});

      const fcs = trajs[ti].featureCentroids || [];
      const genWithExtras = (cx, cy, count) =>
        gen(cx, cy, count).map(pt => {
          
          const mu = (cx + cy) / 2;
          const ci = toGrid(cy); // y
          const cj = toGrid(cx); // coluna = x
          const extras = Array.from({length: numExtraFeatures}, (_, fi) => {
            const s = neighborSum(featureGrids[fi], ci, cj);
            
            const maxVal = 8 * (3 * std); 
            return Math.max(-1, Math.min(1, s / maxVal + boxMuller() * std));
          });
          return {...pt, extras, srcTrajIdx: ti};
        });

      if (!ac.secondary) {
        genWithExtras(ac.main.x, ac.main.y, pts).forEach(pt => pointsT.push(pt));
      } else {
        const nB = Math.round(pts*ac.alpha), nA = pts-nB;
        if (nA>0) genWithExtras(ac.main.x, ac.main.y, nA).forEach(pt => pointsT.push(pt));
        if (nB>0) genWithExtras(ac.secondary.x, ac.secondary.y, nB).forEach(pt => pointsT.push(pt));
      }
    }

    if (!pointsT.length) continue;

    const numTrajs = trajs.length, radius = mlRadius*std;
    const finalColors = [];
    const otherCentroids = [];
    for (let ti=0; ti<trajs.length; ti++) {
      const ac = allCentroids[ti]; if(!ac) continue;
      otherCentroids.push({x:ac.main.x, y:ac.main.y, trajIdx:ti});
      if (ac.secondary) otherCentroids.push({x:ac.secondary.x, y:ac.secondary.y, trajIdx:ti});
    }

    for (let i=0; i<pointsT.length; i++) {
      const {x:px,y:py,extras,srcTrajIdx} = pointsT[i];
      const labels = new Array(numTrajs).fill(0);
      labels[srcTrajIdx] = 1;
      if (labelMode==='multilabel') {
        for (const oc of otherCentroids) {
          if (oc.trajIdx===srcTrajIdx) continue;
          const dx=px-oc.x, dy=py-oc.y;
          if (Math.sqrt(dx*dx+dy*dy)<=radius) labels[oc.trajIdx]=1;
        }
      }
      const numLabels = labels.reduce((a,b)=>a+b,0);
      finalColors.push(numLabels>1 ? MULTILABEL_COLOR : trajs[srcTrajIdx].color);
      pointClass[gid++] = {x:px, y:py, extras:extras||[], t, labels};
    }

    dataPerTick[t] = {points:pointsT, colors:finalColors, centroids:centroidsT};
  }

  return {gStart, gEnd, dataPerTick, pointClass, driftTicks};
}
// ─── Helpers de shuffle e split ───────────────────────────────────────────────
function shuffleByTick(pointClass) {
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

function splitEntries(entries, trainPct) {
  const n = Math.floor(entries.length * trainPct / 100);
  return { train: entries.slice(0, n), test: entries.slice(n) };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function makeCSV(pointClass, trajs, numExtraFeatures, trainPct) {
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
    train: [header, ...train.map(toRow)].join("\n"),
    test:  [header, ...test.map(toRow)].join("\n"),
  };
}

// ─── ARFF ─────────────────────────────────────────────────────────────────────
function makeARFF(pointClass, trajs, numExtraFeatures, trainPct) {
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
    train: [...makeHeader(), ...train.map(toRow)].join("\n"),
    test:  [...makeHeader(), ...test.map(toRow)].join("\n"),
  };
}

// ─── Metadados TXT ────────────────────────────────────────────────────────────
function makeMetaTXT(trajs, driftTicks, numExtraFeatures, trainPct, labelMode) {
  const lines = [];
  lines.push("=== StreamGen Dataset Metadata ===");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Label mode: ${labelMode === 'multilabel' ? 'Multi-label' : 'Multiclass'}`);
  lines.push(`Total clusters: ${trajs.length}`);
  lines.push(`Extra features: ${numExtraFeatures} (f3…f${numExtraFeatures+2})`);
  lines.push(`Train split: ${trainPct}%`);
  lines.push(`Test split: ${100-trainPct}%`);
  lines.push("");

  trajs.forEach((traj, i) => {
    lines.push(`--- Cluster ${i} ---`);
    lines.push(`Color: ${traj.color}`);

    const segStart = Math.min(...traj.segments.map(s => s.tStart));
    const segEnd   = Math.max(...traj.segments.map(s => s.tEnd));
    lines.push(`Duration: ${segStart} - ${segEnd}`);
    lines.push(`Segments: ${traj.segments.length}`);

    traj.segments.forEach((seg, si) => {
      lines.push(`  Segment ${si+1}: type=${seg.type} | t=${seg.tStart}→${seg.tEnd}`);
    });

    // Drift info filtrado pelo intervalo efetivo dos segmentos
    const clusterDriftTicks = [];
    for (const t of driftTicks) {
      const inSegment = traj.segments.some(s => t >= s.tStart && t <= s.tEnd);
      if (inSegment) clusterDriftTicks.push(t);
    }

    if (clusterDriftTicks.length > 0) {
      const driftStart = Math.min(...clusterDriftTicks);
      const driftEnd   = Math.max(...clusterDriftTicks);
      lines.push(`  Drift start: ${driftStart}`);
      lines.push(`  Drift end:   ${driftEnd}`);
      lines.push(`  Drift duration: ${driftEnd - driftStart + 1} ticks`);
    } else {
      lines.push(`  Drift: none detected`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

// ─── Tema ─────────────────────────────────────────────────────────────────────
const makeTheme = (dark) => ({
  bg:        dark?"#f1f5f9":"#070b12",
  sidebar:   dark?"#ffffff":"#0a0f1e",
  border:    dark?"#e2e8f0":"#0d1a2e",
  cardBg:    dark?"#e2e8f0":"#0d1a2e",
  cardBorder:dark?"#e2e8f0":"#0f1f35",
  text:      dark?"#1e293b":"#e2e8f0",
  textMuted: dark?"#1c345a":"#94a3b8",
  textDim:   dark?"#1c345a":"#64748b",
  textFaint: dark?"#3c4149":"#334155",
  label:     dark?"#94a3b8":"#1e3a5f",
  axisX:     dark?"rgba(59,130,246,0.5)":"rgba(96,165,250,0.35)",
  axisY:     dark?"rgba(239,68,68,0.5)":"rgba(248,113,113,0.35)",
  grid:      dark?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.05)",
  canvasBg:  dark?"#f8fafc":"#080c14",
  inputBg:   dark?"#f1f5f9":"#0d1a2e",
  toolbarBg: dark?"#ffffff":"#0a0f1e",
});

// ─── Componente principal ─────────────────────────────────────────────────────
export default function App() {
  const canvasRef     = useRef(null);
  const containerRef  = useRef(null);
  const animRef       = useRef(null);
  const tickRef       = useRef(null);
  const trajRef       = useRef([]);
  const themeRef      = useRef(makeTheme(true));

  const [inputMode,       setInputMode]       = useState("free");
  const [drawing,         setDrawing]         = useState(false);
  const [currentPath,     setCurrentPath]     = useState([]);
  const [currentSegments, setCurrentSegments] = useState([]);
  const [currentColor,    setCurrentColor]    = useState(null);
  const [trajectories,    setTrajectories]    = useState([]);

  // ── Features ────────────────────────────────────────────────────────────────
  const [numExtraFeatures,  setNumExtraFeatures]  = useState(0);

  // Parâmetros
  const [std,         setStd]         = useState(0.05);
  const [pts,         setPts]         = useState(100);
  const [speed,       setSpeed]       = useState(50);
  const [overlapDur,  setOverlapDur]  = useState(0);
  const [mlRadius,    setMlRadius]    = useState(3.0);
  const [labelMode,   setLabelMode]   = useState("multiclass");
  const [distType,    setDistType]    = useState("Gaussian");
  const [startTime,   setStartTime]   = useState(1);
  const [endTime,     setEndTime]     = useState(100);
  const [filename,    setFilename]    = useState("stream");
  const [trainPct, setTrainPct] = useState(80);

  const [isAnimating, setIsAnimating] = useState(false);
  const [tick,        setTick]        = useState(null);
  const [precomp,     setPrecomp]     = useState(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(null); 
  const [status,      setStatus]      = useState({msg:"Ready.",color:"#6b7280"});
  const [showHelp,    setShowHelp]    = useState(false);
  const [darkMode,    setDarkMode]    = useState(true);

  const [theme, setTheme] = useState(()=>makeTheme(true));
  useEffect(()=>{ const t=makeTheme(darkMode); setTheme(t); themeRef.current=t; },[darkMode]);
  useEffect(()=>{ trajRef.current=trajectories; },[trajectories]);

  const currentSegmentsRef  = useRef([]);
  const currentPathRef      = useRef([]);
  const currentColorRef     = useRef(null);
  const drawingRef          = useRef(false);

  useEffect(()=>{ currentSegmentsRef.current  = currentSegments;  },[currentSegments]);
  useEffect(()=>{ currentPathRef.current      = currentPath;      },[currentPath]);
  useEffect(()=>{ currentColorRef.current     = currentColor;     },[currentColor]);
  useEffect(()=>{ drawingRef.current          = drawing;          },[drawing]);
  useEffect(()=>{
    if(!downloadMenuOpen) return;
    const close = (e)=>{
      // Só fecha se o clique foi fora de um elemento com data-download-menu
      if(!e.target.closest('[data-download-menu]')) setDownloadMenuOpen(null);
    };
    document.addEventListener('mousedown', close);
    return ()=>document.removeEventListener('mousedown', close);
  },[downloadMenuOpen]);

  const c2w = useCallback((canvas,ex,ey)=>{
    const r=canvas.getBoundingClientRect();
    return {x:((ex-r.left)/r.width)*2-1, y:-(((ey-r.top)/r.height)*2-1)};
  },[]);
  const w2c = useCallback((canvas,wx,wy)=>({
    px:((wx+1)/2)*canvas.width, py:((1-wy)/2)*canvas.height
  }),[]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const render = useCallback((oP=null,oC=null,oCen=null,driftTicks=null,currentT=null)=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width, H=canvas.height;
    const th=themeRef.current;
    const dark=th.canvasBg==="#080c14";
    const segs=currentSegmentsRef.current;
    const path=currentPathRef.current;
    const col=currentColorRef.current;
    const isDrawing=drawingRef.current;

    ctx.fillStyle=th.canvasBg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=th.grid; ctx.lineWidth=1;
    for(let i=0;i<=10;i++){
      const x=(i/10)*W, y=(i/10)*H;
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
    }
    ctx.strokeStyle=th.axisX; ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    ctx.strokeStyle=th.axisY;
    ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();


    // ── Trajetórias finalizadas ────────────────────────────────────────────
    for(const traj of trajRef.current){
      for(let si=0;si<traj.segments.length;si++){
        const seg=traj.segments[si];
        if(seg.type==='point'){
          const p=w2c(canvas,seg.path[0].x,seg.path[0].y);
          ctx.fillStyle=traj.color; ctx.globalAlpha=1;
          ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle=dark?"#fff":"#1e293b"; ctx.lineWidth=1.5;
          ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.stroke();
          ctx.fillStyle=th.textMuted; ctx.font="10px monospace";
          ctx.fillText(`t:${seg.tStart}→${seg.tEnd}`,p.px+10,p.py-6);
        } else {
          if(seg.path.length<2) continue;
          ctx.strokeStyle=traj.color; ctx.lineWidth=2.5; ctx.globalAlpha=0.8;
          ctx.beginPath();
          const p0=w2c(canvas,seg.path[0].x,seg.path[0].y); ctx.moveTo(p0.px,p0.py);
          for(let i=1;i<seg.path.length;i++){const p=w2c(canvas,seg.path[i].x,seg.path[i].y);ctx.lineTo(p.px,p.py);}
          ctx.stroke();
          const s=w2c(canvas,seg.path[0].x,seg.path[0].y);
          ctx.fillStyle=traj.color; ctx.globalAlpha=1;
          ctx.beginPath();ctx.arc(s.px,s.py,4,0,Math.PI*2);ctx.fill();
        }
        ctx.globalAlpha=1;
      }
    }

    // ── Segments under construction ────────────────────────────────────────────
    for(let si=0;si<segs.length;si++){
      const seg=segs[si];
      if(seg.type==='point'){
        const p=w2c(canvas,seg.path[0].x,seg.path[0].y);
        ctx.fillStyle=col||"#888"; ctx.globalAlpha=1;
        ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=dark?"#fff":"#1e293b"; ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=th.textMuted; ctx.font="10px monospace";
        ctx.fillText(`t:${seg.tStart}→${seg.tEnd}`,p.px+10,p.py-6);
      } else if(seg.path.length>=2){
        ctx.strokeStyle=col||"#888"; ctx.lineWidth=3; ctx.globalAlpha=0.9;
        ctx.beginPath();
        const p0=w2c(canvas,seg.path[0].x,seg.path[0].y); ctx.moveTo(p0.px,p0.py);
        for(let i=1;i<seg.path.length;i++){const p=w2c(canvas,seg.path[i].x,seg.path[i].y);ctx.lineTo(p.px,p.py);}
        ctx.stroke(); ctx.globalAlpha=1;
      }
    }

    // ── Path em desenho ───────────────────────────────────────────────────
    if(isDrawing&&path.length>=2){
      ctx.strokeStyle=col||"#888"; ctx.lineWidth=3; ctx.globalAlpha=0.9;
      ctx.beginPath();
      const p0=w2c(canvas,path[0].x,path[0].y); ctx.moveTo(p0.px,p0.py);
      for(let i=1;i<path.length;i++){const p=w2c(canvas,path[i].x,path[i].y);ctx.lineTo(p.px,p.py);}
      ctx.stroke(); ctx.globalAlpha=1;
    }

    // ── Pontos animados ───────────────────────────────────────────────────
    if(oP&&oC){
      for(let i=0;i<oP.length;i++){
        const p=w2c(canvas,oP[i].x,oP[i].y);
        ctx.fillStyle=oC[i]; ctx.globalAlpha=0.75;
        ctx.beginPath();ctx.arc(p.px,p.py,3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    if(oCen){
      for(const c of oCen){
        const p=w2c(canvas,c.x,c.y);
        ctx.strokeStyle=dark?"#fff":"#1e293b"; ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(p.px-7,p.py-7);ctx.lineTo(p.px+7,p.py+7);
        ctx.moveTo(p.px+7,p.py-7);ctx.lineTo(p.px-7,p.py+7);ctx.stroke();
      }
    }

    if(driftTicks&&currentT!==null&&driftTicks.has(currentT)){
      ctx.fillStyle="rgba(251,191,36,0.06)"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(251,191,36,0.35)"; ctx.lineWidth=2;
      ctx.strokeRect(1,1,W-2,H-2);
    }
  },[w2c]);

  useEffect(()=>{ render(); },[render,theme,trajectories,currentSegments,currentPath,currentColor,drawing]);

  // ─── Mouse / Touch ────────────────────────────────────────────────────────
  const handleDown = useCallback((ex,ey)=>{
    if(isAnimating) return;
    const canvas=canvasRef.current;
    const pt=c2w(canvas,ex,ey);

    const col=currentColor||randomColor(trajRef.current.length);
    setCurrentColor(col);
    if(inputMode==='point'){
      setCurrentSegments(prev=>{
        const n=prev.length+1;
        const total=endTime-startTime;
        const slotSize=Math.floor(total/n);
        const updated=prev.map((s,i)=>({...s,tStart:startTime+i*slotSize,tEnd:startTime+(i+1)*slotSize-1}));
        const newSeg={type:'point',path:[pt],connected:false,tStart:startTime+(n-1)*slotSize,tEnd:endTime};
        if(updated.length>0) updated[updated.length-1].tEnd=newSeg.tStart-1;
        return [...updated,newSeg];
      });
      setStatus({msg:`Point at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`,color:"#94a3b8"});
    } else {
      setCurrentPath([pt]);
      setDrawing(true);
      setStatus({msg:"Drawing...",color:"#94a3b8"});
    }
  },[isAnimating,c2w,currentColor,inputMode,startTime,endTime]);

  const handleMove = useCallback((ex,ey)=>{
    if(!drawing||inputMode!=='free') return;
    const canvas=canvasRef.current;
    setCurrentPath(p=>[...p,c2w(canvas,ex,ey)]);
  },[drawing,inputMode,c2w]);

  const handleUp = useCallback(()=>{
    if(!drawingRef.current || inputMode!=='free') return;
    setDrawing(false);
    const p = currentPathRef.current;
    setCurrentPath([]);
    if(p.length > 3){
      setCurrentSegments(s => {
        const newSeg = {type:'free', path:p, connected:false, tStart:startTime, tEnd:endTime};
        const all = [...s, newSeg];
        const n = all.length;
        const total = endTime - startTime;
        const slotSize = Math.floor(total / n);
        // Redistribui os tempos igualmente entre todos os segmentos
        return all.map((seg, i) => ({
          ...seg,
          tStart: startTime + i * slotSize,
          tEnd: i === n - 1 ? endTime : startTime + (i + 1) * slotSize - 1
        }));
      });
    }
  },[inputMode, startTime, endTime]);

  const updateSegTime = useCallback((idx,field,val)=>{
    setCurrentSegments(prev=>prev.map((s,i)=>i===idx?{...s,[field]:parseInt(val)||0}:s));
  },[]);

  const removeSegment = useCallback((idx)=>{
    setCurrentSegments(prev=>prev.filter((_,i)=>i!==idx));
  },[]);

  const finishCluster = useCallback(()=>{
    const allSegs=[...currentSegments,...(currentPath.length>3
      ?[{type:'free',path:currentPath,tStart:startTime,tEnd:endTime,connected:false}]:[])];
    const valid=allSegs.filter(s=>s.type==='point'||s.path.length>3);
    if(!valid.length){setStatus({msg:"Add points or draw something!",color:"#ef4444"});return;}
    if(startTime>=endTime){setStatus({msg:"Invalid Start/End!",color:"#ef4444"});return;}

    const copies=valid.map(s=>({...s}));

    // Overlap simétrico: ponto de transição = meio da duração total do cluster
    if(overlapDur>0 && copies.length>=2){
      const mid = Math.round((startTime + endTime) / 2);
      const half = Math.round(overlapDur / 2);
      // Segmento 1: termina em mid + half
      copies[0] = {...copies[0], tStart: startTime, tEnd: mid + half};
      // Segmento 2: começa em mid - half
      copies[1] = {...copies[1], tStart: mid - half, tEnd: endTime};
    }

    const color=currentColor||randomColor(trajRef.current.length);
    setTrajectories(p=>[...p,{id:Date.now(),segments:copies,startTime,endTime,color,featureCentroids:[]}]);
    setCurrentSegments([]);setCurrentPath([]);setCurrentColor(null);
    setStatus({msg:`Cluster ${trajRef.current.length+1} finished!`,color:"#22c55e"});
  },[currentSegments,currentPath,startTime,endTime,overlapDur,currentColor]);

  const removeFeatureCentroid = useCallback((trajIdx, fcIdx)=>{
    setTrajectories(prev=>{
      const updated=[...prev];
      const traj={...updated[trajIdx]};
      traj.featureCentroids=(traj.featureCentroids||[]).filter((_,i)=>i!==fcIdx);
      updated[trajIdx]=traj;
      return updated;
    });
  },[]);

  const undo = useCallback(()=>{
    if(currentPath.length>0){setCurrentPath([]);return;}
    if(currentSegments.length>0){setCurrentSegments(p=>p.slice(0,-1));setStatus({msg:"Removed.",color:"#94a3b8"});}
    else if(trajRef.current.length>0){setTrajectories(p=>p.slice(0,-1));setStatus({msg:"Cluster removed.",color:"#94a3b8"});}
    else setStatus({msg:"Nothing to undo.",color:"#f97316"});
  },[currentPath,currentSegments]);

  const clearAll = useCallback(()=>{
    setTrajectories([]);setCurrentSegments([]);setCurrentPath([]);setCurrentColor(null);
    setPrecomp(null);setTick(null);
    if(animRef.current) clearTimeout(animRef.current);
    setIsAnimating(false);
    setStatus({msg:"Cleaned.",color:"#22c55e"});
  },[]);

  const preview = useCallback(()=>{
    const all=[...currentSegments,...(currentPath.length>3?[{type:'free',path:currentPath}]:[])];
    if(!all.length){setStatus({msg:"Nothing to view!",color:"#f97316"});return;}
    render();
    const canvas=canvasRef.current,ctx=canvas.getContext("2d");
    for(const seg of all){
      const cx=seg.type==='point'?seg.path[0].x:seg.path.reduce((s,p)=>s+p.x,0)/seg.path.length;
      const cy=seg.type==='point'?seg.path[0].y:seg.path.reduce((s,p)=>s+p.y,0)/seg.path.length;
      for(const pt of gaussianPoints(cx,cy,std,150)){
        const p=w2c(canvas,pt.x,pt.y);
        ctx.fillStyle=currentColor||"#888"; ctx.globalAlpha=0.4;
        ctx.beginPath();ctx.arc(p.px,p.py,3,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha=1;
    setStatus({msg:"Generated preview.",color:"#94a3b8"});
  },[currentSegments,currentPath,std,currentColor,render,w2c]);

  const stopAnim = useCallback(()=>{
    if(animRef.current) clearTimeout(animRef.current);
    setIsAnimating(false);
  },[]);

  const generate = useCallback(()=>{
    let allT=[...trajRef.current];
    const pending=[...currentSegments,...(currentPath.length>3
      ?[{type:'free',path:currentPath,tStart:startTime,tEnd:endTime,connected:false}]
      :[])].filter(s=>s.type==='point'||s.path.length>3);

    if(pending.length&&startTime<endTime){
      const copies=pending.map(s=>({...s}));

      // Overlap simétrico
      if(overlapDur>0 && copies.length>=2){
        const mid = Math.round((startTime + endTime) / 2);
        const half = Math.round(overlapDur / 2);
        copies[0] = {...copies[0], tStart: startTime, tEnd: mid + half};
        copies[1] = {...copies[1], tStart: mid - half, tEnd: endTime};
      }

      const col=currentColor||randomColor(allT.length);
      allT=[...allT,{id:Date.now(),segments:copies,startTime,endTime,color:col,featureCentroids:[]}];
      setTrajectories(allT);setCurrentSegments([]);setCurrentPath([]);setCurrentColor(null);
    }

    if(!allT.length){setStatus({msg:"No cluster!",color:"#ef4444"});return;}
    setStatus({msg:"Computing...",color:"#94a3b8"});
    const darkCanvas=themeRef.current.canvasBg==="#080c14";
    const res=precomputeData(allT,{std,pts,distType,labelMode,mlRadius,numExtraFeatures,darkCanvas});
    if(!res){setStatus({msg:"Error.",color:"#ef4444"});return;}
    setPrecomp(res);setIsAnimating(true);tickRef.current=res.gStart;setTick(res.gStart);
    setStatus({msg:"Animating...",color:"#3b82f6"});
  },[currentSegments,currentPath,startTime,endTime,overlapDur,currentColor,std,pts,distType,labelMode,mlRadius,numExtraFeatures]);

  const precompRef=useRef(null),speedRef=useRef(50);
  useEffect(()=>{precompRef.current=precomp;},[precomp]);
  useEffect(()=>{speedRef.current=speed;},[speed]);

  useEffect(()=>{
    if(!isAnimating||!precomp) return;
    const {gStart,gEnd,dataPerTick,driftTicks}=precomp;
    tickRef.current=gStart;
    const step=()=>{
      const t=tickRef.current;
      if(t>gEnd){setIsAnimating(false);setStatus({msg:"Done!",color:"#22c55e"});return;}
      setTick(t);
      const d=dataPerTick[t];
      if(d) render(d.points,d.colors,d.centroids,driftTicks,t);
      tickRef.current=t+1;
      animRef.current=setTimeout(step,speedRef.current);
    };
    animRef.current=setTimeout(step,speedRef.current);
    return ()=>clearTimeout(animRef.current);
  },[isAnimating,precomp]);

  const downloadCSV = useCallback(()=>{
  if(!precomp){setStatus({msg:"Generate a stream first!",color:"#f97316"});return;}
  const {train, test} = makeCSV(precomp.pointClass, trajRef.current, numExtraFeatures, trainPct);
  const base = filename.endsWith(".csv") ? filename.replace(".csv","") : filename;

  [["train", train], ["test", test]].forEach(([suffix, content]) => {
    const blob = new Blob([content], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${base}_${suffix}.csv`; a.click();
    URL.revokeObjectURL(url);
  });
  setStatus({msg:`"${base}_train.csv" and "${base}_test.csv" downloaded!`,color:"#22c55e"});
},[precomp, filename, numExtraFeatures, trainPct]);

  const downloadARFF = useCallback(()=>{
    if(!precomp){setStatus({msg:"Generate a stream first!",color:"#f97316"});return;}
    const {train, test} = makeARFF(precomp.pointClass, trajRef.current, numExtraFeatures, trainPct);
    const base = filename.endsWith(".csv") ? filename.replace(".csv","") : filename;

    [["train", train], ["test", test]].forEach(([suffix, content]) => {
      const blob = new Blob([content], {type:"text/plain"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${base}_${suffix}.arff`; a.click();
      URL.revokeObjectURL(url);
    });
    setStatus({msg:`"${base}_train.arff" and "${base}_test.arff" downloaded!`,color:"#22c55e"});
  },[precomp, filename, numExtraFeatures, trainPct]);

  const downloadCSVComplete = useCallback(()=>{
    if(!precomp){setStatus({msg:"Generate a stream first!",color:"#f97316"});return;}
    const {train, test} = makeCSV(precomp.pointClass, trajRef.current, numExtraFeatures, 100);
    // Junta train e test (100% train = arquivo completo sem split)
    const base = filename.endsWith(".csv")?filename.replace(".csv",""):filename;
    const blob = new Blob([train],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`${base}.csv`; a.click();
    URL.revokeObjectURL(url);
    setStatus({msg:`"${base}.csv" downloaded!`,color:"#22c55e"});
    setDownloadMenuOpen(null);
  },[precomp, filename, numExtraFeatures]);

const downloadARFFComplete = useCallback(()=>{
    if(!precomp){setStatus({msg:"Generate a stream first!",color:"#f97316"});return;}
    const {train} = makeARFF(precomp.pointClass, trajRef.current, numExtraFeatures, 100);
    const base = filename.endsWith(".csv")?filename.replace(".csv",""):filename;
    const blob = new Blob([train],{type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`${base}.arff`; a.click();
    URL.revokeObjectURL(url);
    setStatus({msg:`"${base}.arff" downloaded!`,color:"#22c55e"});
    setDownloadMenuOpen(null);
  },[precomp, filename, numExtraFeatures]);

  const downloadMeta = useCallback(()=>{
    if(!precomp){setStatus({msg:"Generate a stream first!",color:"#f97316"});return;}
    const txt = makeMetaTXT(trajRef.current, precomp.driftTicks, numExtraFeatures, trainPct, labelMode);
    const base = filename.endsWith(".csv") ? filename.replace(".csv","") : filename;
    const blob = new Blob([txt], {type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${base}_meta.txt`; a.click();
    URL.revokeObjectURL(url);
    setStatus({msg:`"${base}_meta.txt" downloaded!`,color:"#22c55e"});
  },[precomp, filename, numExtraFeatures, trainPct]);

  const downloadImage = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download=(filename.endsWith(".csv")?filename.replace(".csv",""):filename)+".png";
    a.click(); setStatus({msg:"Saved image!",color:"#22c55e"});
  },[filename]);

  useEffect(()=>{
    const resize=()=>{
      const canvas=canvasRef.current,cont=containerRef.current;
      if(!canvas||!cont) return;
      canvas.width=cont.clientWidth;canvas.height=cont.clientHeight;render();
    };
    resize();window.addEventListener("resize",resize);return ()=>window.removeEventListener("resize",resize);
  },[render]);

  const progress=precomp&&tick!=null?((tick-precomp.gStart)/Math.max(1,precomp.gEnd-precomp.gStart))*100:0;
  const hasMultipleSegs=currentSegments.length>=2;
  const streamDuration=Math.max(1, endTime-startTime);
  const minRecommended=Math.max(2, Math.round(streamDuration*0.05));
  const overlapIsTooShort=overlapDur>0 && overlapDur<minRecommended;
  const isLocked = trajectories.length > 0;

  // WARNINGS -------------------------------
  const inferredType=!hasMultipleSegs
    ? (currentSegments[0]?.type === 'free' ? "Incremental" : "Stationary")
    : overlapDur===0
      ? "Abrupt"
      : overlapIsTooShort
        ? "Too short for Gradual"
        : "Gradual";
  const typeColor=inferredType==="Abrupt"
    ? "#f87171"
    : inferredType==="Gradual"
      ? "#4ade80"
      : inferredType==="Too short for Gradual"
        ? "#f97316"
        : inferredType==="Stationary"
          ? "#94a3b8"
          : "#60a5fa";

  // ─── Sub-componentes UI ───────────────────────────────────────────────────

  const NumInput = ({l, v, set, min=0, max=99999, integer=false, u=""}) => {
    const [localVal, setLocalVal] = useState(String(v));

    useEffect(()=>{ setLocalVal(String(v)); }, [v]);

    const commit = (raw) => {
      const parsed = integer ? parseInt(raw) : parseFloat(raw);
      if(isNaN(parsed)) { setLocalVal(String(v)); return; }
      const clamped = Math.max(min, Math.min(max, parsed));
      set(clamped);
      setLocalVal(String(clamped));
    };

    return (
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
          {u && <span style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace"}}>{u}</span>}
        </div>
        <input
          type="number" value={localVal} min={min} max={max} step={integer?1:"any"}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter') commit(e.target.value); }}
          style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
            color:theme.textMuted,borderRadius:6,padding:"5px 8px",fontSize:12,
            fontFamily:"monospace",boxSizing:"border-box"}}/>
      </div>
    );
  };

  const SliderInput = ({l, v, set, min, max, step, decimals=2, u=""}) => (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
        <span style={{fontSize:11,color:theme.textMuted,fontFamily:"monospace",fontWeight:600}}>{Number(v).toFixed(decimals)}{u}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:"#3b82f6",cursor:"pointer"}}/>
    </div>
  );

  const RadioUI = ({label,opts,val,set})=>(
    <div style={{marginBottom:18}}>
      <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>{label}</div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {opts.map(o=>(
          <button key={o} onClick={()=>set(o)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid",borderColor:val===o?"#17375b":theme.cardBorder,background:val===o?"rgba(59,130,246,0.12)":"transparent",color:val===o?"#17375b":theme.textDim,fontSize:11,cursor:"pointer",textAlign:"left",fontFamily:"monospace"}}>{o}</button>
        ))}
      </div>
    </div>
  );

  const IBtn=({onClick,title,children,accent,danger})=>(
    <button onClick={onClick} title={title} style={{width:34,height:34,borderRadius:7,border:"1px solid",borderColor:danger?"#7f1d1d":accent?"#1d4ed8":theme.border,background:danger?"rgba(239,68,68,0.1)":accent?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.02)",color:danger?"#fca5a5":accent?"#17375b":theme.textMuted,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,flexShrink:0}}>
      {children}
    </button>
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",height:"100vh",background:theme.bg,fontFamily:"'Segoe UI',sans-serif",color:theme.text,overflow:"hidden"}}>

      {/* ── Sidebar ── */}
      <div style={{width:268,minWidth:268,background:theme.sidebar,borderRight:`1px solid ${theme.border}`,display:"flex",flexDirection:"column",padding:"18px 14px",overflowY:"auto"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:800,color:theme.text}}>Stream<span style={{color:"#3b82f6"}}>Gen</span></div>
          <div style={{fontSize:9,color:theme.label,fontFamily:"monospace",marginTop:2,letterSpacing:"0.08em"}}>STREAM GENERATOR</div>
        </div>

        <RadioUI label="Distribution" opts={["Gaussian","RandomRBF"]} val={distType} set={setDistType}/>

        {/* ── Numeric Parameters ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:2}}>
          <SliderInput l="Standard Deviation" min={0} max={0.5} step={0.005} v={std} set={setStd} decimals={3}/>
          <NumInput l="Instances per Centroid" v={pts} set={setPts} min={1} max={5000} integer/>
          <NumInput l="Speed (ms/tick)" v={speed} set={setSpeed} min={10} max={2000} integer u="ms"/>
        </div>

        {/* ── Type ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Type</div>
          <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,border:`1px solid ${theme.border}`}}>
            {[["multiclass","Multiclass"],["multilabel","Multi-Label"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setLabelMode(mode)} style={{
                flex:1,padding:"6px 4px",borderRadius:6,border:"none",fontSize:10,cursor:"pointer",
                fontFamily:"monospace",fontWeight:mode===labelMode?700:400,
                background:mode===labelMode?(mode==="multilabel"?"rgba(168,85,247,0.2)":"rgba(59,130,246,0.15)"):"transparent",
                color:mode===labelMode?(mode==="multilabel"?"#c084fc":"#93c5fd"):theme.textDim,
                transition:"all 0.15s"
              }}>{label}</button>
            ))}
          </div>
          {labelMode==='multilabel'&&(
            <div style={{marginTop:10,background:"rgba(168,85,247,0.05)",border:"1px solid rgba(168,85,247,0.15)",borderRadius:7,padding:"10px 10px 6px"}}>
              <SliderInput l="Radius (N×σ)" min={1} max={6} step={0.1} v={mlRadius} set={setMlRadius} decimals={1} u="σ"/>
              <div style={{fontSize:10,fontFamily:"monospace",color:"#c084fc",marginTop:-6,marginBottom:4}}>
                radius = {(mlRadius*std).toFixed(4)} u
              </div>
              <div style={{fontSize:9,color:theme.textFaint,lineHeight:1.5}}>
                Points within the radius of another cluster receive both labels.
              </div>
            </div>
          )}
          {labelMode==='multiclass'&&(
            <div style={{marginTop:8,fontSize:9,color:theme.textFaint,lineHeight:1.5}}>
              Each point belongs to exactly one cluster <code style={{color:theme.textMuted}}>class_i=1</code> in only one column.
            </div>
          )}
        </div>

        {/* ── Features Extras Globais ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
            textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
            Extra Features
            {numExtraFeatures>0&&<span style={{marginLeft:6,color:"#f5a623"}}>
              {numExtraFeatures} feature{numExtraFeatures>1?"s":""} — grid {GRID_SIZE}×{GRID_SIZE}
            </span>}
          </div>
          <div style={{fontSize:9,color:theme.textFaint,lineHeight:1.6,marginBottom:8}}>
            Global features generated via neighborhood convolution on a discrete grid mapped to the canvas. They follow the centroid over time.
          </div>
          <NumInput l="Nº of extra features" v={numExtraFeatures}
            set={setNumExtraFeatures} min={0} max={10} integer
            disabled={isLocked}/>
          {numExtraFeatures>0&&(
            <div style={{fontSize:9,color:"#f5a623",fontFamily:"monospace",marginTop:-8,marginBottom:8}}>
                f1, f2{Array.from({length:numExtraFeatures},(_,i)=>`, f${i+3}`).join("")}
            </div>
          )}
          {isLocked&&(
            <div style={{fontSize:9,color:"#f87171",lineHeight:1.5}}>
              Locked after 1st cluster. Clear all (✕) to change.
            </div>
          )}
        </div>

        {/* ── Segments under construction ── */}
        {currentSegments.length>0&&(
          <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
              Segments under construction
            </div>
            {currentSegments.map((seg,i)=>{
              // Calcula os tempos ajustados pelo overlap simétrico para exibição
              const mid = Math.round((startTime + endTime) / 2);
              const half = Math.round(overlapDur / 2);
              let displayStart = seg.tStart;
              let displayEnd   = seg.tEnd;
              if(hasMultipleSegs && overlapDur > 0 && currentSegments.length >= 2){
                if(i === 0){ displayStart = startTime; displayEnd = mid + half; }
                if(i === 1){ displayStart = mid - half; displayEnd = endTime; }
              }
              const isAdjusted = hasMultipleSegs && overlapDur > 0 && currentSegments.length >= 2;

              return (
                <div key={i} style={{background:theme.cardBg,borderRadius:7,padding:"8px 10px",marginBottom:6,border:`1px solid ${isAdjusted?"rgba(126,126,126,0.3)":theme.cardBorder}`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:10,color:theme.textMuted,fontFamily:"monospace"}}>
                      {seg.type==='point'?'◉':'✏'} {seg.type==='point'?`(${seg.path[0].x.toFixed(2)}, ${seg.path[0].y.toFixed(2)})`: `Free Seg ${i+1}`}
                    </span>
                    <button onClick={()=>removeSegment(i)} style={{background:"transparent",border:"none",color:theme.textDim,cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:9,color:isAdjusted?"#3c4149":theme.textFaint,fontFamily:"monospace",marginBottom:2}}>
                        t start{isAdjusted&&i===1?" (adjusted)":""}
                      </div>
                      <input type="number"
                        value={isAdjusted ? displayStart : seg.tStart}
                        onChange={e=>{ if(!isAdjusted) updateSegTime(i,'tStart',e.target.value); }}
                        readOnly={isAdjusted}
                        style={{width:"100%",background:isAdjusted?"rgba(251,191,36,0.06)":theme.inputBg,
                          border:`1px solid ${isAdjusted?"rgba(146,146,146,1)":theme.cardBorder}`,
                          color:isAdjusted?"#3c4149":theme.textMuted,
                          borderRadius:5,padding:"3px 6px",fontSize:11,fontFamily:"monospace",
                          boxSizing:"border-box",cursor:isAdjusted?"default":"text"}}/>
                    </div>
                    <div style={{color:theme.textFaint,fontSize:10,marginTop:10}}>→</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:9,color:isAdjusted?"#3c4149":theme.textFaint,fontFamily:"monospace",marginBottom:2}}>
                        t end{isAdjusted&&i===0?" (adjusted)":""}
                      </div>
                      <input type="number"
                        value={isAdjusted ? displayEnd : seg.tEnd}
                        onChange={e=>{ if(!isAdjusted) updateSegTime(i,'tEnd',e.target.value); }}
                        readOnly={isAdjusted}
                        style={{width:"100%",background:isAdjusted?"rgba(251,191,36,0.06)":theme.inputBg,
                          border:`1px solid ${isAdjusted?"rgba(146,146,146,1)":theme.cardBorder}`,
                          color:isAdjusted?"#3c4149":theme.textMuted,
                          borderRadius:5,padding:"3px 6px",fontSize:11,fontFamily:"monospace",
                          boxSizing:"border-box",cursor:isAdjusted?"default":"text"}}/>
                    </div>
                  </div>
                  {isAdjusted&&(
                    <div style={{fontSize:8,color:"#949ba4",fontFamily:"monospace",marginTop:4,opacity:0.8}}>
                      Auto-adjusted by symmetric overlap
                    </div>
                  )}
                </div>
              );
            })}

            {hasMultipleSegs&&(()=>{
              const mid = Math.round((startTime + endTime) / 2);
              const half = Math.round(overlapDur / 2);
              const coStart = mid - half;
              const coEnd   = mid + half;
              const maxOverlap = endTime - startTime;
              const clampedOverlap = Math.min(overlapDur, maxOverlap);

              return (
                <div style={{background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.12)",borderRadius:7,padding:"10px 10px 6px",marginTop:4,marginBottom:8}}>
                  <NumInput
                    l="Transition Duration"
                    v={clampedOverlap}
                    set={v => setOverlapDur(Math.min(v, maxOverlap))}
                    min={0} max={maxOverlap} integer u=" t"/>

                  {/* Warning: overlap too short */}
                  {overlapIsTooShort && (
                    <div style={{fontSize:9,fontFamily:"monospace",color:"#f87171",marginTop:2,marginBottom:4,padding:"4px 8px",borderRadius:5,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)"}}>
                      ⚠ Overlap too short for gradual drift. Recommended: minimum {minRecommended}t ({Math.round(minRecommended/streamDuration*100)}% of the stream).
                    </div>
                  )}

                  {/* Coexistence zone feedback */}
                  {clampedOverlap > 0 && (
                    <div style={{fontSize:9,fontFamily:"monospace",color:"#fbbf24",marginTop:2,marginBottom:4,lineHeight:1.6}}>
                      〰 Coexistence: t={coStart} → t={coEnd} ({clampedOverlap}t)
                      <br/>
                      <span style={{color:theme.textFaint}}>Transition point: t={mid} (midpoint)</span>
                    </div>
                  )}

                  {/* Max/min reference */}
                  {maxOverlap > 0 && (
                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:4}}>
                      Maximum possible: {maxOverlap}t · Recommended minimum: {minRecommended}t
                    </div>
                  )}

                  <div style={{fontSize:10,fontFamily:"monospace",color:typeColor,marginTop:2,marginBottom:4}}>
                    {clampedOverlap===0
                      ? "⚡ Abrupt"
                      : overlapIsTooShort
                        ? "⚠ Too short for Gradual"
                        : `〰 Gradual · ${clampedOverlap}t overlap`}
                  </div>
                </div>
              );
            })()}

            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Detected type:</span>
              <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:typeColor}}>{inferredType}</span>
            </div>
          </div>
        )}

        {/* ── Time Window ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Temporal Window</div>
          <div style={{display:"flex",gap:8}}>
            {[["Start",startTime,setStartTime],["End",endTime,setEndTime]].map(([lbl,val,set])=>(
              <div key={lbl} style={{flex:1}}>
                <div style={{fontSize:9,color:theme.textFaint,marginBottom:4,fontFamily:"monospace"}}>{lbl}</div>
                <input type="number" value={val} onChange={e=>set(parseInt(e.target.value)||0)}
                  style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,color:theme.textMuted,borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
            ))}
          </div>
        </div>

        {/* ── Output / Dataset ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:14}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
            textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
            Dataset Split
          </div>
          <NumInput l="Train %" v={trainPct} set={setTrainPct} min={10} max={90} integer/>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:10}}>
            Train: {trainPct}% · Test: {100-trainPct}%
            <br/>Downloads 2 files (_train / _test)
          </div>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:5}}>Filename</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <input value={filename} onChange={e=>setFilename(e.target.value)}
              style={{flex:1,background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                color:theme.textMuted,borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"monospace"}}/>
          </div>
        </div>

        {/* ── Clusters finalizados ── */}
        {trajectories.length>0&&(
          <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>
                Clusters ({trajectories.length})
              </div>
            </div>
            {trajectories.map((t,i)=>(
              <div key={t.id} style={{marginBottom:7,padding:"5px 8px",borderRadius:6,
                border:`1px solid ${theme.cardBorder}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom: t.segments.length>1?6:0}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                  <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",flex:1}}>
                    C{i} · {t.startTime}→{t.endTime} · {t.segments.length} seg
                  </span>
                </div>
                {t.segments.map((seg,si)=>(
                  <div key={si} style={{display:"flex",alignItems:"center",gap:4,
                    marginLeft:16,marginTop:3}}>
                    <span style={{fontSize:8,color:theme.textFaint,fontFamily:"monospace",flexShrink:0}}>
                      {seg.type==='point'?'◉':'✏'} seg{si+1}
                    </span>
                    <span style={{fontSize:8,color:theme.textMuted,fontFamily:"monospace",
                      background:theme.inputBg,borderRadius:4,padding:"1px 5px",
                      border:`1px solid ${theme.cardBorder}`}}>
                      {seg.tStart}→{seg.tEnd}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{flex:1}}/>
        <button onClick={()=>setShowHelp(true)} style={{marginTop:16,background:"transparent",border:`1px solid ${theme.border}`,color:theme.textFaint,borderRadius:6,padding:"5px",fontSize:10,cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.05em"}}>? Help</button>
      </div>

      {/* ── Main ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

        {/* Toolbar */}
        <div style={{height:50,background:theme.toolbarBg,borderBottom:`1px solid ${theme.border}`,display:"flex",alignItems:"center",padding:"0 14px",gap:6}}>

          <div style={{display:"flex",gap:2,background:theme.bg,borderRadius:7,padding:2,border:`1px solid ${theme.border}`}}>
            {[["free","✏","Draw"],["point","◉","Points"]].map(([mode,icon,label])=>(
              <button key={mode} onClick={()=>setInputMode(mode)} title={label}
                style={{padding:"4px 10px",borderRadius:5,border:"none",fontSize:12,cursor:"pointer",
                  background:inputMode===mode?theme.cardBg:"transparent",
                  color:inputMode===mode?theme.text:theme.textDim,
                  display:"flex",alignItems:"center",gap:5}}>
                {icon}<span style={{fontSize:10}}>{label}</span>
              </button>
            ))}
          </div>
          <div style={{width:1,height:20,background:theme.border,margin:"0 2px"}}/>
          <IBtn onClick={finishCluster} title="Finish Cluster" accent>＋</IBtn>
          <IBtn onClick={preview} title="Preview">◎</IBtn>
          <IBtn onClick={undo} title="Undo">↩</IBtn>
          <IBtn onClick={clearAll} title="Clear All" danger>✕</IBtn>
          <div style={{width:1,height:20,background:theme.border,margin:"0 2px"}}/>

          <button onClick={isAnimating?stopAnim:generate} style={{padding:"6px 16px",borderRadius:7,border:"none",background:isAnimating?"#7f1d1d":"#1d4ed8",color:isAnimating?"#fca5a5":"#bfdbfe",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
            {isAnimating?"⏹ Stop":"▶ Generate Stream"}
          </button>
          {/* <button onClick={downloadCSV} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ CSV</button>
          <button onClick={downloadARFF} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ ARFF</button>
          <button onClick={downloadMeta} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ META</button>
           */}

          {/* Download CSV dropdown */}
          <div style={{position:"relative"}}>
            <button
              onClick={()=>setDownloadMenuOpen(m=>m==='csv'?null:'csv')}
              style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,
                background:downloadMenuOpen==='csv'?theme.cardBg:"transparent",
                color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                display:"flex",alignItems:"center",gap:4}}>
              ⬇ CSV ▾
            </button>
            {downloadMenuOpen==='csv'&&(
              <div style={{position:"absolute",top:"100%",left:0,marginTop:4,
                background:theme.sidebar,border:`1px solid ${theme.border}`,
                borderRadius:7,overflow:"hidden",zIndex:100,minWidth:160,
                boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}} data-download-menu>
                <button onClick={downloadCSVComplete}
                  style={{width:"100%",padding:"8px 14px",border:"none",background:"transparent",
                    color:theme.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                    textAlign:"left",display:"block"}}
                  onMouseEnter={e=>e.target.style.background=theme.cardBg}
                  onMouseLeave={e=>e.target.style.background="transparent"}>
                  Complete
                </button>
                <button onClick={()=>{downloadCSV();setDownloadMenuOpen(null);}}
                  style={{width:"100%",padding:"8px 14px",border:"none",background:"transparent",
                    color:theme.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                    textAlign:"left",display:"block"}}
                  onMouseEnter={e=>e.target.style.background=theme.cardBg}
                  onMouseLeave={e=>e.target.style.background="transparent"}>
                  Train / Test Split ({trainPct}% / {100-trainPct}%)
                </button>
              </div>
            )}
          </div>

          {/* Download ARFF dropdown */}
          <div style={{position:"relative"}}>
            <button
              onClick={()=>setDownloadMenuOpen(m=>m==='arff'?null:'arff')}
              style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,
                background:downloadMenuOpen==='arff'?theme.cardBg:"transparent",
                color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                display:"flex",alignItems:"center",gap:4}}>
              ⬇ ARFF ▾
            </button>
            {downloadMenuOpen==='arff'&&(
              <div style={{position:"absolute",top:"100%",left:0,marginTop:4,
                background:theme.sidebar,border:`1px solid ${theme.border}`,
                borderRadius:7,overflow:"hidden",zIndex:100,minWidth:160,
                boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}} data-download-menu>
                <button onClick={downloadARFFComplete}
                  style={{width:"100%",padding:"8px 14px",border:"none",background:"transparent",
                    color:theme.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                    textAlign:"left",display:"block"}}
                  onMouseEnter={e=>e.target.style.background=theme.cardBg}
                  onMouseLeave={e=>e.target.style.background="transparent"}>
                  Complete
                </button>
                <button onClick={()=>{downloadARFF();setDownloadMenuOpen(null);}}
                  style={{width:"100%",padding:"8px 14px",border:"none",background:"transparent",
                    color:theme.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                    textAlign:"left",display:"block"}}
                  onMouseEnter={e=>e.target.style.background=theme.cardBg}
                  onMouseLeave={e=>e.target.style.background="transparent"}>
                  Train / Test Split ({trainPct}% / {100-trainPct}%)
                </button>
              </div>
            )}
          </div>

          <button onClick={downloadMeta} style={{padding:"6px 12px",borderRadius:7,
            border:`1px solid ${theme.border}`,background:"transparent",
            color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>
            ⬇ META
          </button>
          <button onClick={downloadImage} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ PNG</button>
          <button onClick={()=>setDarkMode(d=>!d)} title="Alternar tema" style={{width:34,height:34,borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16}}>
            {darkMode?"🌙":"☀️"}
          </button>

          <div style={{flex:1}}/>
          {precomp&&tick!=null&&precomp.driftTicks.has(tick)&&(
            <span style={{fontSize:9,color:"#fbbf24",fontFamily:"monospace",marginRight:8}}>⚡ DRIFT</span>
          )}
          <div style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:isAnimating?"#60a5fa":theme.label,letterSpacing:"0.06em"}}>T: {tick??"-"}</div>
        </div>

        {/* Barra de progresso */}
        <div style={{height:2,background:theme.bg}}>
          <div style={{height:"100%",width:`${progress}%`,background:"#3b82f6",transition:"width 0.04s linear"}}/>
        </div>

        {/* Canvas */}
        <div ref={containerRef} style={{flex:1,position:"relative",overflow:"hidden",cursor:isAnimating?"default":"crosshair"}}>
          <canvas ref={canvasRef}
            onMouseDown={e=>handleDown(e.clientX,e.clientY)}
            onMouseMove={e=>handleMove(e.clientX,e.clientY)}
            onMouseUp={handleUp} onMouseLeave={handleUp}
            onTouchStart={e=>{e.preventDefault();handleDown(e.touches[0].clientX,e.touches[0].clientY);}}
            onTouchMove={e=>{e.preventDefault();handleMove(e.touches[0].clientX,e.touches[0].clientY);}}
            onTouchEnd={e=>{e.preventDefault();handleUp();}}
            style={{display:"block",width:"100%",height:"100%"}}/>
          <div style={{position:"absolute",bottom:12,left:12,background:darkMode?"rgba(7,11,18,0.88)":"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",border:`1px solid ${theme.border}`,borderRadius:7,padding:"4px 12px",fontSize:10,fontFamily:"monospace",color:status.color}}>
            {status.msg}
          </div>
          <div style={{position:"absolute",bottom:12,right:12,fontSize:9,color:theme.label,fontFamily:"monospace"}}>x,y ∈ [−1, 1]</div>
          {numExtraFeatures>0&&(
            <div style={{position:"absolute",top:10,right:12,background:"rgba(245,166,35,0.1)",border:"1px solid rgba(245,166,35,0.3)",borderRadius:6,padding:"3px 10px",fontSize:9,fontFamily:"monospace",color:"#f5a623"}}>
              ◆ {numExtraFeatures + 2} features · grid {GRID_SIZE}×{GRID_SIZE}
            </div>
          )}
        </div>
      </div>

      {/* ── Help Modal ── */}
      {showHelp&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}
          onClick={()=>setShowHelp(false)}>
          <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,borderRadius:14,padding:28,maxWidth:520,width:"90%",maxHeight:"85vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:20,color:theme.text}}>Help</div>
            {[
              ["✏ Draw","Drag to draw the continuous path of the centroid over time."],
              ["◉ Points","Click to position discrete centroids in feature space."],
              ["⟷ Connected","Points interpolate linearly — Incremental drift, no overlap."],
              ["· Disconnected","Centroid jumps abruptly — Abrupt drift."],
              ["〰 Overlap","With 2+ free segments and overlap > 0 — Gradual drift."],
              ["● Multi-Label","Points within the radius (N×σ) of another cluster receive multiple labels."],
              ["Output","Complete/Test: CSV with drift_occurred. Training: without drift_occurred."],
              ["▶ Generate","Animates and computes the dataset."],
              ["⬇ CSV / PNG","Downloads the dataset or canvas image."],
            ].map(([t,d])=>(
              <div key={t} style={{marginBottom:9}}>
                <div style={{fontSize:11,fontWeight:700,color:"#60a5fa",marginBottom:2,fontFamily:"monospace"}}>{t}</div>
                <div style={{fontSize:11,color:theme.textDim}}>{d}</div>
              </div>
            ))}
            <button onClick={()=>setShowHelp(false)} style={{marginTop:16,width:"100%",padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}