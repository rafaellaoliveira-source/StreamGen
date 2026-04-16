import { useState, useRef, useEffect, useCallback } from "react";

const CLUSTER_COLORS = ["#e05c5c","#4e9af1","#4ec994","#f5a623","#b36fd6","#f06c9b","#00c9c9","#d4b44a"];
const randomColor = (idx) => CLUSTER_COLORS[idx % CLUSTER_COLORS.length];

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

// ─── Pré-cálculo ─────────────────────────────────────────────────────────────
function precomputeData(trajs, {std, pts, distType, labelMode, mlRadius}) {
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
      if (curr.tStart <= prev.tEnd) {
        for (let t = curr.tStart; t <= prev.tEnd; t++) driftTicks.add(t);
      } else {
        driftTicks.add(curr.tStart);
      }
    }
  }

  const gen = (cx,cy,n) => distType==="RandomRBF"
    ? rbfPoints(cx,cy,std,n)
    : gaussianPoints(cx,cy,std,n);

  for (let t = gStart; t <= gEnd; t++) {

    const allCentroids = trajs.map((traj, ti) => {
      const activeSegs = traj.segments.filter(s => s.tStart <= t && t <= s.tEnd);
      if (!activeSegs.length) return null;

      const getC = (seg) => {
        if (seg.type === 'point') return seg.path[0];
        const prog = Math.max(0, Math.min(1, (t - seg.tStart) / Math.max(1, seg.tEnd - seg.tStart)));
        return getCentroid(seg.path, prog);
      };

      if (activeSegs.length === 1) {
        return {main: getC(activeSegs[0]), secondary: null, alpha: 1};
      } else {
        activeSegs.sort((a,b) => a.tStart - b.tStart);
        const segA = activeSegs[0], segB = activeSegs[1];
        const zoneStart = segB.tStart, zoneEnd = segA.tEnd;
        const zoneDur = Math.max(1, zoneEnd - zoneStart);
        const alpha = Math.max(0, Math.min(1, (t - zoneStart) / zoneDur));
        return {main: getC(segA), secondary: getC(segB), alpha};
      }
    });

    // ─── Passo 2: gera pontos para cada trajetória ativa
    const pointsT = [], centroidsT = [];

    for (let ti = 0; ti < trajs.length; ti++) {
      const ac = allCentroids[ti];
      if (!ac) continue;

      centroidsT.push({x: ac.main.x, y: ac.main.y});

      if (!ac.secondary) {
        const p = gen(ac.main.x, ac.main.y, pts);
        p.forEach(pt => pointsT.push({...pt, srcTrajIdx: ti}));
      } else {
        const nB = Math.round(pts * ac.alpha);
        const nA = pts - nB;
        if (nA > 0) gen(ac.main.x, ac.main.y, nA).forEach(pt => pointsT.push({...pt, srcTrajIdx: ti}));
        if (nB > 0) gen(ac.secondary.x, ac.secondary.y, nB).forEach(pt => pointsT.push({...pt, srcTrajIdx: ti}));
      }
    }

    if (!pointsT.length) continue;

    // ─── Passo 3: atribui rótulos e cores
    const numTrajs = trajs.length;
    const radius = mlRadius * std;
    const finalColors = [];

    const otherCentroids = []; // [{x,y,trajIdx}]
    for (let ti = 0; ti < trajs.length; ti++) {
      const ac = allCentroids[ti];
      if (!ac) continue;
      otherCentroids.push({x: ac.main.x, y: ac.main.y, trajIdx: ti});
      if (ac.secondary) otherCentroids.push({x: ac.secondary.x, y: ac.secondary.y, trajIdx: ti});
    }

    for (let i = 0; i < pointsT.length; i++) {
      const {x: px, y: py, srcTrajIdx} = pointsT[i];
      const labels = new Array(numTrajs).fill(0);
      labels[srcTrajIdx] = 1; // rótulo primário sempre marcado

      if (labelMode === 'multilabel') {
        // Busca centroides de OUTROS trajs dentro do raio
        for (const oc of otherCentroids) {
          if (oc.trajIdx === srcTrajIdx) continue;
          const dx = px - oc.x, dy = py - oc.y;
          if (Math.sqrt(dx*dx + dy*dy) <= radius) {
            labels[oc.trajIdx] = 1;
          }
        }
      }

      const numLabels = labels.reduce((a,b) => a+b, 0);
      finalColors.push(numLabels > 1 ? "#111111" : trajs[srcTrajIdx].color);

      pointClass[gid++] = {x: px, y: py, t, labels};
    }

    dataPerTick[t] = {points: pointsT, colors: finalColors, centroids: centroidsT};
  }

  return {gStart, gEnd, dataPerTick, pointClass, driftTicks};
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function makeCSV(pointClass, trajs, driftTicks) {
  const header = ["global_id","timestamp","x","y",
    ...trajs.map((_,i) => `class_${i}`)].join(",");
  const rows = Object.entries(pointClass)
    .sort((a,b) => a[1].t - b[1].t)
    .map(([id,{x,y,t,labels}]) =>
      [id, t, x.toFixed(6), y.toFixed(6), ...labels].join(",")
    );
  return [header,...rows].join("\n");
}
// old function
// function makeCSV(pointClass, trajs, driftTicks) {
//   const header = ["global_id","timestamp","x","y","drift_occurred",
//     ...trajs.map((_,i) => `class_${i}`)].join(",");
//   const rows = Object.entries(pointClass)
//     .sort((a,b) => a[1].t - b[1].t)
//     .map(([id,{x,y,t,labels}]) =>
//       [id, t, x.toFixed(6), y.toFixed(6), driftTicks.has(t)?1:0, ...labels].join(",")
//     );
//   return [header,...rows].join("\n");
// }

// ─── Tema (fora do componente para estabilidade) ───────────────────────────
// const makeTheme = (dark) => ({
//   bg:        dark?"#070b12":"#f1f5f9",
//   sidebar:   dark?"#0a0f1e":"#ffffff",
//   border:    dark?"#0d1a2e":"#e2e8f0",
//   cardBg:    dark?"#0d1a2e":"#f8fafc",
//   cardBorder:dark?"#0f1f35":"#e2e8f0",
//   text:      dark?"#e2e8f0":"#1e293b",
//   textMuted: dark?"#94a3b8":"#64748b",
//   textDim:   dark?"#64748b":"#94a3b8",
//   textFaint: dark?"#334155":"#cbd5e1",
//   label:     dark?"#1e3a5f":"#94a3b8",
//   axisX:     dark?"rgba(96,165,250,0.35)":"rgba(59,130,246,0.5)",
//   axisY:     dark?"rgba(248,113,113,0.35)":"rgba(239,68,68,0.5)",
//   grid:      dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.06)",
//   canvasBg:  dark?"#080c14":"#f8fafc",
//   inputBg:   dark?"#0d1a2e":"#f1f5f9",
//   toolbarBg: dark?"#0a0f1e":"#ffffff",
// });

// Altera modo claro para modo escuro
const makeTheme = (dark) => ({
  bg:        dark?"#f1f5f9":"#070b12",
  sidebar:   dark?"#ffffff":"#0a0f1e",
  border:    dark?"#e2e8f0":"#0d1a2e",
  cardBg:    dark?"#e2e8f0":"#0d1a2e",
  cardBorder:dark?"#e2e8f0":"#0f1f35",
  text:      dark?"#1e293b":"#e2e8f0",
  textMuted: dark?"#64748b":"#94a3b8",
  textDim:   dark?"#94a3b8":"#64748b",
  textFaint: dark?"#cbd5e1":"#334155",
  label:     dark?"#94a3b8":"#1e3a5f",
  axisX:     dark?"rgba(59,130,246,0.5)":"rgba(96,165,250,0.35)",
  axisY:     dark?"rgba(239,68,68,0.5)":"rgba(248,113,113,0.35)",
  grid:      dark?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.05)",
  canvasBg:  dark?"#f8fafc":"#080c14",
  inputBg:   dark?"#f1f5f9":"#0d1a2e",
  toolbarBg: dark?"#ffffff":"#0a0f1e",
});

// ─── Componente principal ─────────────────────────────────────────────────
export default function App() {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const animRef      = useRef(null);
  const tickRef      = useRef(null);
  const trajRef      = useRef([]);
  const themeRef     = useRef(makeTheme(true));

  // Modo de entrada
  const [inputMode,      setInputMode]      = useState("free");
  const [pointConnected, setPointConnected] = useState(false);

  // Desenho atual
  const [drawing,         setDrawing]         = useState(false);
  const [currentPath,     setCurrentPath]     = useState([]);
  const [currentSegments, setCurrentSegments] = useState([]);
  const [currentColor,    setCurrentColor]    = useState(null);

  // Clusters finalizados
  const [trajectories, setTrajectories] = useState([]);

  // Parâmetros
  const [std,        setStd]        = useState(0.05);
  const [pts,        setPts]        = useState(100);
  const [speed,      setSpeed]      = useState(50);
  const [overlapDur, setOverlapDur] = useState(0);
  const [mlRadius,   setMlRadius]   = useState(3.0);
  const [labelMode,  setLabelMode]  = useState("multiclass"); // "multiclass" | "multilabel"
  const [distType,   setDistType]   = useState("Gaussiano");
  const [startTime,  setStartTime]  = useState(1);
  const [endTime,    setEndTime]    = useState(100);
  const [filename,   setFilename]   = useState("stream");

  // Animação
  const [isAnimating, setIsAnimating] = useState(false);
  const [tick,        setTick]        = useState(null);
  const [precomp,     setPrecomp]     = useState(null);
  const [status,      setStatus]      = useState({msg:"Pronto.",color:"#6b7280"});
  const [showHelp,    setShowHelp]    = useState(false);
  const [darkMode,    setDarkMode]    = useState(true);

  // Tema como ref para não invalidar callbacks
  const [theme, setTheme] = useState(() => makeTheme(true));
  useEffect(() => {
    const t = makeTheme(darkMode);
    setTheme(t);
    themeRef.current = t;
  }, [darkMode]);

  useEffect(() => { trajRef.current = trajectories; }, [trajectories]);

  // ─── Refs para render estável ─────────────────────────────────────────────
  const currentSegmentsRef = useRef([]);
  const currentPathRef     = useRef([]);
  const currentColorRef    = useRef(null);
  const drawingRef         = useRef(false);
  const pointConnectedRef  = useRef(false);

  useEffect(() => { currentSegmentsRef.current = currentSegments; }, [currentSegments]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  useEffect(() => { pointConnectedRef.current = pointConnected; }, [pointConnected]);

  const c2w = useCallback((canvas,ex,ey) => {
    const r = canvas.getBoundingClientRect();
    return {x:((ex-r.left)/r.width)*2-1, y:-(((ey-r.top)/r.height)*2-1)};
  },[]);
  const w2c = useCallback((canvas,wx,wy) => ({
    px:((wx+1)/2)*canvas.width, py:((1-wy)/2)*canvas.height
  }),[]);

  // ─── Render (deps mínimas via refs) ──────────────────────────────────────
  const render = useCallback((oP=null,oC=null,oCen=null,driftTicks=null,currentT=null) => {
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const th = themeRef.current;
    const dark = th.canvasBg === "#080c14";
    const segs = currentSegmentsRef.current;
    const path = currentPathRef.current;
    const col  = currentColorRef.current;
    const isDrawing = drawingRef.current;
    const ptConn = pointConnectedRef.current;

    ctx.fillStyle = th.canvasBg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
    for(let i=0;i<=10;i++){
      const x=(i/10)*W, y=(i/10)*H;
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
    }
    ctx.strokeStyle = th.axisX; ctx.lineWidth = 1.5;
    ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    ctx.strokeStyle = th.axisY;
    ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();

    // Trajetórias finalizadas
    for(const traj of trajRef.current){
      for(let si=0;si<traj.segments.length;si++){
        const seg = traj.segments[si];
        if(seg.type === 'point'){
          const p = w2c(canvas, seg.path[0].x, seg.path[0].y);
          ctx.fillStyle = traj.color; ctx.globalAlpha = 1;
          ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle = dark?"#fff":"#1e293b"; ctx.lineWidth = 1.5;
          ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.stroke();
          ctx.fillStyle = th.textMuted; ctx.font = "10px monospace";
          ctx.fillText(`t:${seg.tStart}→${seg.tEnd}`, p.px+10, p.py-6);
          if(si < traj.segments.length-1 && seg.connected){
            const next = traj.segments[si+1];
            const p2 = w2c(canvas, next.path[0].x, next.path[0].y);
            ctx.strokeStyle = traj.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.35;
            ctx.setLineDash([4,4]);
            ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p2.px,p2.py);ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
          if(seg.path.length < 2) continue;
          ctx.strokeStyle = traj.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8;
          ctx.beginPath();
          const p0 = w2c(canvas, seg.path[0].x, seg.path[0].y); ctx.moveTo(p0.px,p0.py);
          for(let i=1;i<seg.path.length;i++){const p=w2c(canvas,seg.path[i].x,seg.path[i].y);ctx.lineTo(p.px,p.py);}
          ctx.stroke();
          const s = w2c(canvas, seg.path[0].x, seg.path[0].y);
          ctx.fillStyle = traj.color; ctx.globalAlpha = 1;
          ctx.beginPath();ctx.arc(s.px,s.py,4,0,Math.PI*2);ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Segmentos em construção
    for(let si=0;si<segs.length;si++){
      const seg = segs[si];
      if(seg.type === 'point'){
        const p = w2c(canvas, seg.path[0].x, seg.path[0].y);
        ctx.fillStyle = col||"#888"; ctx.globalAlpha = 1;
        ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle = dark?"#fff":"#1e293b"; ctx.lineWidth = 1.5;
        ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle = th.textMuted; ctx.font = "10px monospace";
        ctx.fillText(`t:${seg.tStart}→${seg.tEnd}`, p.px+10, p.py-6);
        if(ptConn && si<segs.length-1 && segs[si+1].type==='point'){
          const p2 = w2c(canvas, segs[si+1].path[0].x, segs[si+1].path[0].y);
          ctx.strokeStyle = col||"#888"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.35;
          ctx.setLineDash([4,4]);
          ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p2.px,p2.py);ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      } else if(seg.path.length >= 2){
        ctx.strokeStyle = col||"#888"; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        const p0 = w2c(canvas, seg.path[0].x, seg.path[0].y); ctx.moveTo(p0.px,p0.py);
        for(let i=1;i<seg.path.length;i++){const p=w2c(canvas,seg.path[i].x,seg.path[i].y);ctx.lineTo(p.px,p.py);}
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    // Path em desenho
    if(isDrawing && path.length >= 2){
      ctx.strokeStyle = col||"#888"; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const p0 = w2c(canvas, path[0].x, path[0].y); ctx.moveTo(p0.px,p0.py);
      for(let i=1;i<path.length;i++){const p=w2c(canvas,path[i].x,path[i].y);ctx.lineTo(p.px,p.py);}
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // Pontos animados
    if(oP && oC){
      for(let i=0;i<oP.length;i++){
        const p = w2c(canvas, oP[i].x, oP[i].y);
        ctx.fillStyle = oC[i]; ctx.globalAlpha = 0.75;
        ctx.beginPath();ctx.arc(p.px,p.py,3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if(oCen){
      for(const c of oCen){
        const p = w2c(canvas, c.x, c.y);
        ctx.strokeStyle = dark?"#fff":"#1e293b"; ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(p.px-7,p.py-7);ctx.lineTo(p.px+7,p.py+7);
        ctx.moveTo(p.px+7,p.py-7);ctx.lineTo(p.px-7,p.py+7);ctx.stroke();
      }
    }

    // Highlight zona de drift
    if(driftTicks && currentT !== null && driftTicks.has(currentT)){
      ctx.fillStyle = "rgba(251,191,36,0.06)"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle = "rgba(251,191,36,0.35)"; ctx.lineWidth = 2;
      ctx.strokeRect(1,1,W-2,H-2);
    }
  },[w2c]); // só w2c como dep — resto via refs

  useEffect(() => { render(); }, [render, theme, trajectories, currentSegments, currentPath, currentColor, drawing, pointConnected]);

  // ─── Mouse / Touch ────────────────────────────────────────────────────────
  const handleDown = useCallback((ex,ey) => {
    if(isAnimating) return;
    const canvas = canvasRef.current;
    const pt = c2w(canvas, ex, ey);
    const col = currentColor || randomColor(trajRef.current.length);
    setCurrentColor(col);
    if(inputMode === 'point'){
      setCurrentSegments(prev => {
        const n = prev.length + 1;
        const total = endTime - startTime;
        const slotSize = Math.floor(total / n);
        const updated = prev.map((s,i) => ({...s, tStart: startTime+i*slotSize, tEnd: startTime+(i+1)*slotSize-1}));
        const newSeg = {type:'point', path:[pt], connected:pointConnected, tStart: startTime+(n-1)*slotSize, tEnd: endTime};
        if(updated.length > 0) updated[updated.length-1].tEnd = newSeg.tStart - 1;
        return [...updated, newSeg];
      });
      setStatus({msg:`Point at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`, color:"#94a3b8"});
    } else {
      setCurrentPath([pt]);
      setDrawing(true);
      setStatus({msg:"Drawing...", color:"#94a3b8"});
    }
  },[isAnimating, c2w, currentColor, inputMode, pointConnected, startTime, endTime]);

  const handleMove = useCallback((ex,ey) => {
    if(!drawing || inputMode !== 'free') return;
    const canvas = canvasRef.current;
    setCurrentPath(p => [...p, c2w(canvas,ex,ey)]);
  },[drawing, inputMode, c2w]);

  const handleUp = useCallback(() => {
    if(!drawing || inputMode !== 'free') return;
    setDrawing(false);
    setCurrentPath(p => {
      if(p.length > 3) setCurrentSegments(s => [...s, {type:'free', path:p, tStart:startTime, tEnd:endTime, connected:false}]);
      return [];
    });
  },[drawing, inputMode, startTime, endTime]);

  // ─── Editar tempo de segmento ─────────────────────────────────────────────
  const updateSegTime = useCallback((idx,field,val) => {
    setCurrentSegments(prev => prev.map((s,i) => i===idx ? {...s,[field]:parseInt(val)||0} : s));
  },[]);

  const removeSegment = useCallback((idx) => {
    setCurrentSegments(prev => prev.filter((_,i) => i!==idx));
  },[]);

  // ─── Finalizar cluster ────────────────────────────────────────────────────
  const finishCluster = useCallback(() => {
    const allSegs = [...currentSegments, ...(currentPath.length > 3
      ? [{type:'free', path:currentPath, tStart:startTime, tEnd:endTime, connected:false}]
      : [])];
    const valid = allSegs.filter(s => s.type==='point' || s.path.length > 3);
    if(!valid.length) { setStatus({msg:"Add points or draw something!", color:"#ef4444"}); return; }
    if(startTime >= endTime) { setStatus({msg:"Invalid Start/End!", color:"#ef4444"}); return; }

    // Cria cópias e aplica overlap
    const copies = valid.map(s => ({...s}));
    for(let i = 0; i < copies.length - 1; i++){
      if(overlapDur > 0){
        const next = copies[i+1];
        const newTEnd = Math.min(next.tStart + overlapDur - 1, next.tEnd - 1);
        copies[i] = {...copies[i], tEnd: newTEnd};
      }
    }

    const color = currentColor || randomColor(trajRef.current.length);
    setTrajectories(p => [...p, {id:Date.now(), segments:copies, startTime, endTime, color}]);
    setCurrentSegments([]); setCurrentPath([]); setCurrentColor(null);
    setStatus({msg:`Cluster ${trajRef.current.length+1} finalizado!`, color:"#22c55e"});
  },[currentSegments, currentPath, startTime, endTime, overlapDur, currentColor]);

  // ─── Undo / Clear ─────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if(currentPath.length > 0)          { setCurrentPath([]); return; }
    if(currentSegments.length > 0)      { setCurrentSegments(p => p.slice(0,-1)); setStatus({msg:"Removido.", color:"#94a3b8"}); }
    else if(trajRef.current.length > 0) { setTrajectories(p => p.slice(0,-1)); setStatus({msg:"Cluster removido.", color:"#94a3b8"}); }
    else setStatus({msg:"Nada para desfazer.", color:"#f97316"});
  },[currentPath, currentSegments]);

  const clearAll = useCallback(() => {
    setTrajectories([]); setCurrentSegments([]); setCurrentPath([]); setCurrentColor(null);
    setPrecomp(null); setTick(null);
    if(animRef.current) clearTimeout(animRef.current);
    setIsAnimating(false);
    setStatus({msg:"Cleaned.", color:"#22c55e"});
  },[]);

  // ─── Preview ──────────────────────────────────────────────────────────────
  const preview = useCallback(() => {
    const all = [...currentSegments, ...(currentPath.length>3 ? [{type:'free',path:currentPath}] : [])];
    if(!all.length){ setStatus({msg:"Nothing to view!", color:"#f97316"}); return; }
    render();
    const canvas = canvasRef.current, ctx = canvas.getContext("2d");
    for(const seg of all){
      const cx = seg.type==='point' ? seg.path[0].x : seg.path.reduce((s,p)=>s+p.x,0)/seg.path.length;
      const cy = seg.type==='point' ? seg.path[0].y : seg.path.reduce((s,p)=>s+p.y,0)/seg.path.length;
      for(const pt of gaussianPoints(cx,cy,std,150)){
        const p = w2c(canvas,pt.x,pt.y);
        ctx.fillStyle = currentColor||"#888"; ctx.globalAlpha = 0.4;
        ctx.beginPath();ctx.arc(p.px,p.py,3,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    setStatus({msg:"Generated preview.", color:"#94a3b8"});
  },[currentSegments,currentPath,std,currentColor,render,w2c]);

  // ─── Gerar / Animar ───────────────────────────────────────────────────────
  const stopAnim = useCallback(() => {
    if(animRef.current) clearTimeout(animRef.current);
    setIsAnimating(false);
  },[]);

  const generate = useCallback(() => {
    let allT = [...trajRef.current];
    const pending = [...currentSegments, ...(currentPath.length>3
      ? [{type:'free',path:currentPath,tStart:startTime,tEnd:endTime,connected:false}]
      : [])].filter(s => s.type==='point' || s.path.length>3);

    if(pending.length && startTime < endTime){
      // Aplica overlap aos segmentos pendentes também
      const copies = pending.map(s => ({...s}));
      for(let i = 0; i < copies.length - 1; i++){
        if(overlapDur > 0){
          const next = copies[i+1];
          const newTEnd = Math.min(next.tStart + overlapDur - 1, next.tEnd - 1);
          copies[i] = {...copies[i], tEnd: newTEnd};
        }
      }
      const col = currentColor || randomColor(allT.length);
      allT = [...allT, {id:Date.now(), segments:copies, startTime, endTime, color:col}];
      setTrajectories(allT); setCurrentSegments([]); setCurrentPath([]); setCurrentColor(null);
    }

    if(!allT.length){ setStatus({msg:"Nenhum cluster!", color:"#ef4444"}); return; }
    setStatus({msg:"Computando...", color:"#94a3b8"});
    const res = precomputeData(allT, {std, pts, distType, labelMode, mlRadius});
    if(!res){ setStatus({msg:"Erro.", color:"#ef4444"}); return; }
    setPrecomp(res); setIsAnimating(true); tickRef.current = res.gStart; setTick(res.gStart);
    setStatus({msg:"Animando...", color:"#3b82f6"});
  },[currentSegments, currentPath, startTime, endTime, overlapDur, currentColor, std, pts, distType, labelMode, mlRadius]);

  // Loop de animação estável (render fora das deps intencionalmente)
  const precompRef = useRef(null);
  const speedRef   = useRef(50);
  useEffect(() => { precompRef.current = precomp; }, [precomp]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    if(!isAnimating || !precomp) return;
    const {gStart, gEnd, dataPerTick, driftTicks} = precomp;
    tickRef.current = gStart;
    const step = () => {
      const t = tickRef.current;
      if(t > gEnd){ setIsAnimating(false); setStatus({msg:"Concluído!", color:"#22c55e"}); return; }
      setTick(t);
      const d = dataPerTick[t];
      if(d) render(d.points, d.colors, d.centroids, driftTicks, t);
      tickRef.current = t + 1;
      animRef.current = setTimeout(step, speedRef.current);
    };
    animRef.current = setTimeout(step, speedRef.current);
    return () => clearTimeout(animRef.current);
  },[isAnimating, precomp]); // render fora das deps para evitar loop

  // ─── Download CSV ─────────────────────────────────────────────────────────
  const downloadCSV = useCallback(() => {
    if(!precomp){ setStatus({msg:"Gere o stream primeiro!", color:"#f97316"}); return; }
    const csv = makeCSV(precomp.pointClass, trajRef.current, precomp.driftTicks);
    const blob = new Blob([csv], {type:"text/csv"}), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename.endsWith(".csv")?filename:filename+".csv"; a.click(); URL.revokeObjectURL(url);
    setStatus({msg:`"${a.download}" baixado!`, color:"#22c55e"});
  },[precomp, filename]);

  // ─── Download PNG ─────────────────────────────────────────────────────────
  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = (filename.endsWith(".csv")?filename.replace(".csv",""):filename)+".png";
    a.click();
    setStatus({msg:"Imagem salva!", color:"#22c55e"});
  },[filename]);

  // ─── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current, cont = containerRef.current;
      if(!canvas||!cont) return;
      canvas.width = cont.clientWidth; canvas.height = cont.clientHeight; render();
    };
    resize(); window.addEventListener("resize",resize); return () => window.removeEventListener("resize",resize);
  },[render]);

  // ─── Computados ──────────────────────────────────────────────────────────
  const progress = precomp && tick!=null ? ((tick-precomp.gStart)/Math.max(1,precomp.gEnd-precomp.gStart))*100 : 0;
  const hasMultipleSegs = currentSegments.length >= 2;
  const inferredType = !hasMultipleSegs ? "Incremental" : overlapDur===0 ? "Abrupt" : "Gradual";
  const typeColor = inferredType==="Abrupt" ? "#f87171" : inferredType==="Gradual" ? "#4ade80" : "#60a5fa";

  // ─── Sub-componentes UI ───────────────────────────────────────────────────
  const SliderUI = ({l,min,max,step,v,set,u="",decimals=0}) => (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
        <span style={{fontSize:11,color:theme.textMuted,fontFamily:"monospace",fontWeight:600}}>
          {decimals>0 ? v.toFixed(decimals) : v}{u}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:"#3b82f6",cursor:"pointer"}}/>
    </div>
  );

  const RadioUI = ({label,opts,val,set}) => (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>{label}</div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {opts.map(o=>(
          <button key={o} onClick={()=>set(o)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid",borderColor:val===o?"#3b82f6":theme.cardBorder,background:val===o?"rgba(59,130,246,0.12)":"transparent",color:val===o?"#93c5fd":theme.textDim,fontSize:11,cursor:"pointer",textAlign:"left",fontFamily:"monospace"}}>{o}</button>
        ))}
      </div>
    </div>
  );

  const IBtn = ({onClick,title,children,accent,danger}) => (
    <button onClick={onClick} title={title} style={{width:34,height:34,borderRadius:7,border:"1px solid",borderColor:danger?"#7f1d1d":accent?"#1d4ed8":theme.border,background:danger?"rgba(239,68,68,0.1)":accent?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.02)",color:danger?"#fca5a5":accent?"#93c5fd":theme.textMuted,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,flexShrink:0}}>
      {children}
    </button>
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",height:"100vh",background:theme.bg,fontFamily:"'Segoe UI',sans-serif",color:theme.text,overflow:"hidden"}}>

      {/* ── Sidebar ── */}
      <div style={{width:260,minWidth:260,background:theme.sidebar,borderRight:`1px solid ${theme.border}`,display:"flex",flexDirection:"column",padding:"18px 14px",overflowY:"auto"}}>
        <div style={{marginBottom:22}}>
          <div style={{fontSize:15,fontWeight:800,color:theme.text}}>Stream<span style={{color:"#3b82f6"}}>Gen</span></div>
          <div style={{fontSize:9,color:theme.label,fontFamily:"monospace",marginTop:2,letterSpacing:"0.08em"}}>STREAM GENERATOR</div>
        </div>

        <RadioUI label="Distribuição" opts={["Gaussiano","RandomRBF"]} val={distType} set={setDistType}/>

        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:16,marginTop:2}}>
          <SliderUI l="Standard Deviation"       min={0}   max={0.5} step={0.01} v={std}   set={setStd}/>
          <SliderUI l="Inst. per Centroid" min={1}   max={500} step={1}    v={pts}   set={setPts}/>
          <SliderUI l="Speed"          min={10}  max={500} step={10}   v={speed} set={setSpeed} u="ms"/>
        </div>

        {/* ── Modo de rótulo ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
            Modo de Rótulo
          </div>
          <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,border:`1px solid ${theme.border}`}}>
            {[["multiclass","Multiclass","One Label per point"],["multilabel","Multi-Label","Multiple labels per point"]].map(([mode,label,tip])=>(
              <button key={mode} onClick={()=>setLabelMode(mode)} title={tip} style={{
                flex:1,padding:"6px 4px",borderRadius:6,border:"none",fontSize:10,cursor:"pointer",
                fontFamily:"monospace",fontWeight:mode===labelMode?700:400,letterSpacing:"0.03em",
                background:mode===labelMode?(mode==="multilabel"?"rgba(168,85,247,0.2)":"rgba(59,130,246,0.15)"):"transparent",
                color:mode===labelMode?(mode==="multilabel"?"#c084fc":"#93c5fd"):theme.textDim,
                transition:"all 0.15s"
              }}>{label}</button>
            ))}
          </div>

          {/* Slider de raio — só aparece em modo multilabel */}
          {labelMode === 'multilabel' && (
            <div style={{marginTop:10,background:"rgba(168,85,247,0.05)",border:"1px solid rgba(168,85,247,0.15)",borderRadius:7,padding:"10px 10px 6px"}}>
              <SliderUI l="Raio (N × σ)" min={1} max={6} step={0.1} v={mlRadius} set={setMlRadius} decimals={1} u="σ"/>
              <div style={{fontSize:10,fontFamily:"monospace",color:"#c084fc",marginTop:-6,marginBottom:4}}>
                raio = {(mlRadius * std).toFixed(4)} u
              </div>
              <div style={{fontSize:9,color:theme.textFaint,lineHeight:1.5}}>
                Points within the radius of another cluster receive both labels and remain <span style={{color:"#a1a1aa"}}>dark</span> on the canvas.
              </div>
            </div>
          )}

          {/* Info multiclasse */}
          {labelMode === 'multiclass' && (
            <div style={{marginTop:8,fontSize:9,color:theme.textFaint,lineHeight:1.5}}>
              Each point belongs to exactly one cluster. CSV has <code style={{color:theme.textMuted}}>class_i=1</code> for only one column.
            </div>
          )}
        </div>

        {/* ── Segmentos em construção ── */}
        {currentSegments.length > 0 && (
          <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
              Segments under construction
            </div>
            {currentSegments.map((seg,i)=>(
              <div key={i} style={{background:theme.cardBg,borderRadius:7,padding:"8px 10px",marginBottom:6,border:`1px solid ${theme.cardBorder}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:10,color:theme.textMuted,fontFamily:"monospace"}}>
                    {seg.type==='point'?'◉':'✏'} {seg.type==='point'?`(${seg.path[0].x.toFixed(2)}, ${seg.path[0].y.toFixed(2)})`: `Seg livre ${i+1}`}
                  </span>
                  <button onClick={()=>removeSegment(i)} style={{background:"transparent",border:"none",color:theme.textDim,cursor:"pointer",fontSize:12}}>✕</button>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:2}}>t início</div>
                    <input type="number" value={seg.tStart} onChange={e=>updateSegTime(i,'tStart',e.target.value)}
                      style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,color:theme.textMuted,borderRadius:5,padding:"3px 6px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}}/>
                  </div>
                  <div style={{color:theme.textFaint,fontSize:10,marginTop:10}}>→</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:2}}>t fim</div>
                    <input type="number" value={seg.tEnd} onChange={e=>updateSegTime(i,'tEnd',e.target.value)}
                      style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,color:theme.textMuted,borderRadius:5,padding:"3px 6px",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}}/>
                  </div>
                </div>
              </div>
            ))}

            {/* Slider de transição — apenas com 2+ segmentos */}
            {hasMultipleSegs && (
              <div style={{background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.12)",borderRadius:7,padding:"10px 10px 6px",marginTop:4,marginBottom:8}}>
                <SliderUI l="Duração da Transição" min={0} max={100} step={1} v={overlapDur} set={setOverlapDur} u=" t"/>
                <div style={{fontSize:10,fontFamily:"monospace",color:typeColor,marginTop:-6,marginBottom:4}}>
                  {overlapDur===0?"⚡ Abrupto":`〰 Gradual · ${overlapDur}t de sobreposição`}
                </div>
              </div>
            )}

            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Tipo detectado:</span>
              <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:typeColor}}>{inferredType}</span>
            </div>
          </div>
        )}

        {/* ── Janela temporal ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:4}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Janela Temporal</div>
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

        {/* ── Arquivo ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:14}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Arquivo</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <input value={filename} onChange={e=>setFilename(e.target.value)}
              style={{flex:1,background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,color:theme.textMuted,borderRadius:6,padding:"4px 7px",fontSize:11,fontFamily:"monospace"}}/>
            <span style={{fontSize:10,color:theme.label,fontFamily:"monospace"}}>.csv</span>
          </div>
        </div>

        {/* ── Clusters finalizados ── */}
        {trajectories.length > 0 && (
          <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginTop:14}}>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
              Clusters ({trajectories.length})
            </div>
            {trajectories.map((t,i)=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace"}}>C{i} · {t.startTime}→{t.endTime} · {t.segments.length} seg</span>
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

          {/* Modo de entrada */}
          <div style={{display:"flex",gap:2,background:theme.bg,borderRadius:7,padding:2,border:`1px solid ${theme.border}`}}>
            {[["free","✏","Draw"],["point","◉","Points"]].map(([mode,icon,label])=>(
              <button key={mode} onClick={()=>setInputMode(mode)} title={label} style={{padding:"4px 10px",borderRadius:5,border:"none",fontSize:12,cursor:"pointer",background:inputMode===mode?theme.cardBg:"transparent",color:inputMode===mode?theme.text:theme.textDim,display:"flex",alignItems:"center",gap:5}}>
                {icon} <span style={{fontSize:10}}>{label}</span>
              </button>
            ))}
          </div>

          {/* Conectar pontos */}
          {inputMode==='point' && (
            <button onClick={()=>setPointConnected(p=>!p)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid",fontSize:11,cursor:"pointer",borderColor:pointConnected?"#7c3aed":theme.border,background:pointConnected?"rgba(124,58,237,0.15)":"transparent",color:pointConnected?"#c4b5fd":theme.textDim,fontFamily:"monospace"}}>
              {pointConnected?"⟷ Conected":"· Disconnected"}
            </button>
          )}

          <div style={{width:1,height:20,background:theme.border,margin:"0 2px"}}/>
          <IBtn onClick={finishCluster} title="Finish Cluster" accent>＋</IBtn>
          <IBtn onClick={preview} title="Preview">◎</IBtn>
          <IBtn onClick={undo} title="Undo">↩</IBtn>
          <IBtn onClick={clearAll} title="Clear All" danger>✕</IBtn>
          <div style={{width:1,height:20,background:theme.border,margin:"0 2px"}}/>

          <button onClick={isAnimating?stopAnim:generate} style={{padding:"6px 16px",borderRadius:7,border:"none",background:isAnimating?"#7f1d1d":"#1d4ed8",color:isAnimating?"#fca5a5":"#bfdbfe",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
            {isAnimating?"⏹ Stop":"▶ Generate Stream"}
          </button>
          <button onClick={downloadCSV} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ CSV</button>
          <button onClick={downloadImage} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⬇ PNG</button>

          {/* Toggle tema */}
          <button onClick={()=>setDarkMode(d=>!d)} title="Alternar tema" style={{width:34,height:34,borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16}}>
            {darkMode?"🌙":"☀️"}
          </button>

          <div style={{flex:1}}/>
          {precomp && tick!=null && precomp.driftTicks.has(tick) && (
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
        </div>
      </div>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}
          onClick={()=>setShowHelp(false)}>
          <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,borderRadius:14,padding:28,maxWidth:500,width:"90%"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:20,color:theme.text}}>Como usar</div>
            {[
              ["✏  Draw","Drag to draw the continuous path."],
              ["◉  Pontos","Click to position discrete centroids in feature space."],
              ["⟷  Conectado","Points interpolate with each other over time."],
              ["·  Desconectado","Centroid jumps abruptly between points ."],
              ["〰  Overlap","With 2+ segments and overlap > 0, two centroids coexist."],
              ["●  Multi-Label Mode","Activate in 'Label Mode'. Points within the radius (N×σ) of another cluster receive multiple labels and appear black."],
              ["Sidebar","Edit the start and end times of each segment directly."],
              ["▶  Generate","Animates and computes the complete dataset."],
              ["⬇  CSV / PNG","Downloads the dataset with class_i multilabel, or the canvas image."],
            ].map(([t,d])=>(
              <div key={t} style={{marginBottom:9}}>
                <div style={{fontSize:11,fontWeight:700,color:"#60a5fa",marginBottom:2,fontFamily:"monospace"}}>{t}</div>
                <div style={{fontSize:11,color:theme.textDim}}>{d}</div>
              </div>
            ))}
            <button onClick={()=>setShowHelp(false)} style={{marginTop:16,width:"100%",padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textDim,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
