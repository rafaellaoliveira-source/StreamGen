import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Imports dos módulos separados ────────────────────────────────────────────
import { CLUSTER_COLORS, FEATURE_COLORS, GRID_SIZE, randomColor, featureColor, makeTheme } from "./theme.js";
import { boxMuller, gaussianPoints, rbfPoints } from "./generators/gaussian.js";
import { getCentroid, getMoorePositions, precomputeData } from "./generators/precompute.js";
import { makeCSV, shuffleByTick, splitEntries } from "./export/csv.js";
import { makeARFF } from "./export/arff.js";
import { makeMetaTXT } from "./export/meta.js";
import { downloadImage as downloadImageFile } from "./export/image.js";
import NumInput from "./components/NumInput.jsx";
import SliderInput from "./components/SliderInput.jsx";
import RadioUI from "./components/RadioUI.jsx";
import IBtn from "./components/IBtn.jsx";
import { generateHyperplane } from "./generators/hyperplane.js";
import { generateSEA, SEA_THRESHOLDS } from "./generators/sea.js";
import { HelpIcon } from "./components/Tooltip.jsx";



// ─── DensityModal ─────────────────────────────────────────────────────────────
function DensityModal({ traj, trajIdx, defaultPts, theme, rules, onAddRule, onRemoveRule, onClose, onSave }) {
  const validIntervals = traj.segments.map(s => ({tStart: s.tStart, tEnd: s.tEnd}));
  const [newRule, setNewRule] = useState({tStart:'', tEnd:'', pts:''});
  const [ruleError, setRuleError] = useState('');

  const isValidRule = (r) =>
    validIntervals.some(iv => r.tStart >= iv.tStart && r.tEnd <= iv.tEnd) &&
    r.tStart < r.tEnd && r.pts >= 1;

  const addRule = () => {
    console.log('addRule called, newRule:', newRule);
    console.log('onAddRule type:', typeof onAddRule);
    const r = {
      tStart: parseInt(newRule.tStart),
      tEnd: parseInt(newRule.tEnd),
      pts: parseInt(newRule.pts)
    };
    console.log('parsed r:', r);
    console.log('isValid:', isValidRule(r));
    console.log('validIntervals:', validIntervals);
    if(isNaN(r.tStart)||isNaN(r.tEnd)||isNaN(r.pts)){
      setRuleError('All fields are required.'); return;
    }
    if(!isValidRule(r)){
      setRuleError(`Range must be within: ${validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}`);
      return;
    }
    setRuleError('');
    onAddRule(r);
    setNewRule({tStart:'', tEnd:'', pts:''});
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
      justifyContent:"center",zIndex:200}}
      onClick={onClose}>
      <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
        borderRadius:14,padding:24,maxWidth:420,width:"90%",maxHeight:"80vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:traj.color,flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:700,color:theme.text}}>
            Cluster {trajIdx} — Frequency Rules
          </span>
        </div>

        <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:12,lineHeight:1.6}}>
          Global default: {defaultPts} inst/tick<br/>
          Valid intervals: {validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}
        </div>

        {rules.length===0 && (
          <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:12}}>
            No rules — using global default.
          </div>
        )}
        {rules.map((r,ri)=>(
          <div key={ri} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
            padding:"5px 8px",borderRadius:6,border:`1px solid ${theme.cardBorder}`,
            background:theme.cardBg}}>
            <span style={{fontSize:10,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
              t = {r.tStart} → t = {r.tEnd} · {r.pts} inst/tick
            </span>
            <button onClick={()=>onRemoveRule(ri)}
              style={{background:"transparent",border:"none",color:"#f87171",
                cursor:"pointer",fontSize:12,padding:0}}>✕</button>
          </div>
        ))}

        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:12,marginTop:8}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8}}>
            Add rule
          </div>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {[["t start","tStart"],["t end","tEnd"],["inst/tick","pts"]].map(([lbl,key])=>(
              <div key={key} style={{flex:1}}>
                <div style={{fontSize:8,color:theme.textFaint,fontFamily:"monospace",marginBottom:3}}>{lbl}</div>
                <input type="number" value={newRule[key]}
                  onChange={e=>setNewRule(prev=>({...prev,[key]:e.target.value}))}
                  style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                    color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                    fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
            ))}
          </div>
          {ruleError&&(
            <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:6,lineHeight:1.5}}>
              ⚠ {ruleError}
            </div>
          )}
          <button onClick={addRule}
            style={{width:"100%",padding:"6px",borderRadius:6,border:"none",
              background:"rgba(59,130,246,0.15)",color:"#93c5fd",
              fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
            + Add rule
          </button>
        </div>

        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={onClose}
            style={{flex:1,padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,
              background:"transparent",color:theme.textDim,cursor:"pointer",
              fontSize:11,fontFamily:"monospace"}}>
            Cancel
          </button>
          <button onClick={() => { console.log('Save, rules prop:', rules); onSave(); }}
            style={{flex:1,padding:"7px",borderRadius:7,border:"none",
              background:"rgba(59,130,246,0.2)",color:"#93c5fd",
              cursor:"pointer",fontSize:11,fontFamily:"monospace",fontWeight:700}}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


function FeatureConfigModal({ fi, trajs, transforms, onChange, onClose, theme }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
      justifyContent:"center",zIndex:200}}
      onClick={onClose}>
      <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
        borderRadius:14,padding:24,maxWidth:380,width:"90%"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{fontSize:13,fontWeight:700,color:theme.text,marginBottom:4}}>
          f{fi+3} Configuration
        </div>

        {trajs.map((traj, ti) => {
          const t = transforms[fi]?.[ti] ?? {factor:1, offset:0};
          return (
            <div key={ti} style={{marginBottom:12,padding:"10px 12px",
              borderRadius:8,border:`1px solid ${theme.cardBorder}`,
              background:theme.cardBg}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",
                  background:traj.color,flexShrink:0}}/>
                <span style={{fontSize:10,color:theme.textMuted,
                  fontFamily:"monospace"}}>C{ti}</span>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:theme.textFaint,
                    fontFamily:"monospace",marginBottom:4}}>Factor <HelpIcon text="Scales the distance of this feature from the centroid. factor > 1 = farther, factor < 1 = closer, factor < 0 = opposite side." theme={theme}/></div>
                  <input type="number" value={t.factor} step={0.1} min={-3} max={3}
                     onChange={e=>{
                      const v = parseFloat(e.target.value)||1;
                      onChange(fi, ti, "factor", Math.max(-3, Math.min(3, v)));
                    }}
                    style={{width:"100%",background:theme.inputBg,
                      border:`1px solid ${theme.cardBorder}`,
                      color:theme.textMuted,borderRadius:5,
                      padding:"4px 6px",fontSize:11,fontFamily:"monospace",
                      boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:theme.textFaint,
                    fontFamily:"monospace",marginBottom:4}}>Offset <HelpIcon text="Shifts the feature position. Range: [−0.5, 0.5]. Positive = right/up, Negative = left/down." theme={theme}/></div>
                  <input type="number" value={t.offset} step={0.05}
                     onChange={e=>{
                      const v = parseFloat(e.target.value)||0;
                      onChange(fi, ti, "offset", Math.max(-0.5, Math.min(0.5, v)));
                    }}
                    style={{width:"100%",background:theme.inputBg,
                      border:`1px solid ${theme.cardBorder}`,
                      color:theme.textMuted,borderRadius:5,
                      padding:"4px 6px",fontSize:11,fontFamily:"monospace",
                      boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{fontSize:9,color:theme.textFaint,
                fontFamily:"monospace",marginTop:6}}>
                f{fi+3} = value × {t.factor} + {t.offset}
              </div>
            </div>
          );
        })}

        <button onClick={onClose}
          style={{marginTop:8,width:"100%",padding:"7px",borderRadius:7,
            border:`1px solid ${theme.border}`,background:"transparent",
            color:theme.textDim,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function App() {
  const canvasRef     = useRef(null);
  const containerRef  = useRef(null);
  const animRef       = useRef(null);
  const tickRef       = useRef(null);
  const trajRef       = useRef([]);
  const themeRef      = useRef(makeTheme(true));
  const selectedFeaturesRef = useRef(new Set());
  

  const [inputMode,       setInputMode]       = useState("free");
  const [drawing,         setDrawing]         = useState(false);
  const [currentPath,     setCurrentPath]     = useState([]);
  const [currentSegments, setCurrentSegments] = useState([]);
  const [currentColor,    setCurrentColor]    = useState(null);
  const [trajectories,    setTrajectories]    = useState([]);
  const [featureStep, setFeatureStep] = useState(0.05);
  

  const featureStepRef = useRef(0.05);
  useEffect(()=>{ featureStepRef.current = featureStep; }, [featureStep]);



  // ── Features ────────────────────────────────────────────────────────────────
  const [numExtraFeatures,  setNumExtraFeatures]  = useState(0);

  const numExtraFeaturesRef = useRef(0);
  useEffect(()=>{ numExtraFeaturesRef.current = numExtraFeatures; }, [numExtraFeatures]);

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
  const [trainPct, setTrainPct] = useState(20);

  const [isAnimating, setIsAnimating] = useState(false);
  const [tick,        setTick]        = useState(null);
  const [precomp,     setPrecomp]     = useState(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(null);
  const [densityModal, setDensityModal] = useState(null);
  const [editingRules, setEditingRules] = useState([]);
  const [showStreamParams, setShowStreamParams] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [paramsUnlocked, setParamsUnlocked] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [status,      setStatus]      = useState({msg:"Ready.",color:"#6b7280"});
  const [showHelp,    setShowHelp]    = useState(false);
  const [darkMode,    setDarkMode]    = useState(true);
  const [hoveredFeatureVal, setHoveredFeatureVal] = useState(null);
  const [featureTransforms, setFeatureTransforms] = useState({});
  const [featureConfigModal, setFeatureConfigModal] = useState(null);
  
 

  // ── Accordion state ──────────────────────────────────────────────
  const [openSections, setOpenSections] = useState({
    distribution: true, parameters: true, type: true, 
    features: true, segments: true, temporal: true,
    output: true, clusters: true,
  });
  const toggleSection = (key) =>
    setOpenSections(prev => ({...prev, [key]: !prev[key]}));

  const [theme, setTheme] = useState(()=>makeTheme(true));
  useEffect(()=>{ const t=makeTheme(darkMode); setTheme(t); themeRef.current=t; },[darkMode]);
  useEffect(()=>{ trajRef.current=trajectories; },[trajectories]);

  const currentSegmentsRef  = useRef([]);
  const currentPathRef      = useRef([]);
  const currentColorRef     = useRef(null);
  const drawingRef          = useRef(false);
  const isLocked = trajectories.length > 0;

  const [selectedFeatures, setSelectedFeatures] = useState(new Set());

  useEffect(()=>{ currentSegmentsRef.current  = currentSegments;  },[currentSegments]);
  useEffect(()=>{ currentPathRef.current      = currentPath;      },[currentPath]);
  useEffect(()=>{ currentColorRef.current     = currentColor;     },[currentColor]);
  useEffect(()=>{ drawingRef.current          = drawing;          },[drawing]);
  useEffect(()=>{
    if(!downloadMenuOpen) return;
    const close = (e)=>{
      if(!e.target.closest('[data-download-menu]')) setDownloadMenuOpen(null);
    };
    document.addEventListener('mousedown', close);
    return ()=>document.removeEventListener('mousedown', close);
  },[downloadMenuOpen]);

  const isAnimatingRef = useRef(false);
  useEffect(()=>{ isAnimatingRef.current = isAnimating; },[isAnimating]);

  const c2w = useCallback((canvas,ex,ey)=>{
    const r=canvas.getBoundingClientRect();
    return {x:((ex-r.left)/r.width)*2-1, y:-(((ey-r.top)/r.height)*2-1)};
  },[]);
  const w2c = useCallback((canvas,wx,wy)=>({
    px:((wx+1)/2)*canvas.width, py:((1-wy)/2)*canvas.height
  }),[]);

  const toggleFeature = (fi) => {
    setSelectedFeatures(prev => {
      const next = new Set(prev);
      if(next.has(fi)) next.delete(fi); else next.add(fi);
      selectedFeaturesRef.current = next;
      return next;
    });
  };

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
    const fStep = featureStepRef.current;
    const nExtraFeats = numExtraFeaturesRef.current;


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

    // ── Auxiliary functions ───────────────────────────────────────────────
    const drawFeaturePoint = (px, py, fpx, fpy, fc) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(fpx, fpy);
      ctx.strokeStyle = fc; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(fpx, fpy, 6, 0, Math.PI*2);
      ctx.fillStyle = fc; ctx.globalAlpha = 0.9; ctx.fill();
      ctx.strokeStyle = dark ? "#ffffff" : "#1e293b";
      ctx.lineWidth = 1.8; ctx.globalAlpha = 1; ctx.stroke();

      if(dark){
        ctx.beginPath();
        ctx.arc(fpx, fpy, 9, 0, Math.PI*2);
        ctx.strokeStyle = fc; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const drawFeatureLabel = (fpx, fpy, fi) => {
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = FEATURE_COLORS[fi % FEATURE_COLORS.length];
      ctx.globalAlpha = 0.9;
      ctx.textAlign = "center";
      ctx.fillText(`f${fi+3}`, fpx, fpy - 10);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    };

    const drawFeaturesAround = (cx, cy, p) => {
      const moorePositions = getMoorePositions(nExtraFeats);
      selectedFeaturesRef.current.forEach(fi => {
        if(fi >= moorePositions.length) return;
        const [dx, dy] = moorePositions[fi];
        const fc = FEATURE_COLORS[fi % FEATURE_COLORS.length];
        const fx = cx + dx * fStep;
        const fy = cy + dy * fStep;
        const fp = w2c(canvas, fx, fy);
        drawFeaturePoint(p.px, p.py, fp.px, fp.py, fc);
        drawFeatureLabel(fp.px, fp.py, fi);
      });
    };

    // ── Completed trajectories ────────────────────────────────────────────
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
    

    // ── Path in drawing ───────────────────────────────────────────────────
    if(isDrawing&&path.length>=2){
      ctx.strokeStyle=col||"#888"; ctx.lineWidth=3; ctx.globalAlpha=0.9;
      ctx.beginPath();
      const p0=w2c(canvas,path[0].x,path[0].y); ctx.moveTo(p0.px,p0.py);
      for(let i=1;i<path.length;i++){const p=w2c(canvas,path[i].x,path[i].y);ctx.lineTo(p.px,p.py);}
      ctx.stroke(); ctx.globalAlpha=1;
    }

    // ── Statis Extra Features ────────────────────────
    if(!oCen && selectedFeaturesRef.current.size > 0){
      const trajs = trajRef.current;
      if(trajs.length > 0){
        const moorePositions = getMoorePositions(nExtraFeats);

        trajs.forEach((traj) => {
          const seg = traj.segments[0];
          if(!seg) return;
          const c = seg.path[0];
          const p = w2c(canvas, c.x, c.y);

          selectedFeaturesRef.current.forEach(fi => {
            if(fi >= moorePositions.length) return;
            const [dx, dy] = moorePositions[fi];
            const fc = FEATURE_COLORS[fi % FEATURE_COLORS.length];
            const fx = c.x + dx * fStep;
            const fy = c.y + dy * fStep;
            const fp = w2c(canvas, fx, fy);

            // ctx.beginPath();
            // ctx.moveTo(p.px, p.py);
            // ctx.lineTo(fp.px, fp.py);
            // ctx.strokeStyle = fc;
            // ctx.lineWidth = 1;
            // ctx.globalAlpha = 0.3;
            // ctx.stroke();

            ctx.beginPath();
            ctx.arc(fp.px, fp.py, 6, 0, Math.PI*2);
            ctx.fillStyle = fc;
            ctx.globalAlpha = 0.9;
            ctx.fill();
            ctx.strokeStyle = dark ? "#ffffff" : "#1e293b";
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = 1;
            ctx.stroke();
            if(dark){
              ctx.beginPath();
              ctx.arc(fp.px, fp.py, 9, 0, Math.PI*2);
              ctx.strokeStyle = fc;
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.3;
              ctx.stroke();
            }
            ctx.globalAlpha = 1;

            ctx.font = "bold 9px monospace";
            ctx.fillStyle = fc;
            ctx.globalAlpha = 0.9;
            ctx.textAlign = "center";
            ctx.fillText(`f${fi+3}`, fp.px, fp.py - 10);
            ctx.globalAlpha = 1;
            ctx.textAlign = "left";
          });
        });
      }
    }

    // ── Animated Poits ──────────────────────────────────────────────────
    if(oP&&oC){
      for(let i=0;i<oP.length;i++){
        const p=w2c(canvas,oP[i].x,oP[i].y);
        ctx.fillStyle=oC[i]; ctx.globalAlpha=0.75;
        ctx.beginPath();ctx.arc(p.px,p.py,3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    // ── Animated Centroids ──────────────────────────────────────────────
    if(oCen){
      for(let ti=0;ti<oCen.length;ti++){
        const c=oCen[ti];
        const p=w2c(canvas,c.x,c.y);
        ctx.strokeStyle=dark?"#fff":"#1e293b"; ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(p.px-7,p.py-7);ctx.lineTo(p.px+7,p.py+7);
        ctx.moveTo(p.px+7,p.py-7);ctx.lineTo(p.px-7,p.py+7);ctx.stroke();

        if(selectedFeaturesRef.current.size > 0){
          drawFeaturesAround(c.x, c.y, p);
        }
      }
    }

    if(driftTicks&&currentT!==null&&driftTicks.has(currentT)){
      ctx.fillStyle="rgba(251,191,36,0.06)"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(251,191,36,0.35)"; ctx.lineWidth=2;
      ctx.strokeRect(1,1,W-2,H-2);
    }
  },[w2c, selectedFeaturesRef, std, featureStepRef, numExtraFeaturesRef]);

  useEffect(()=>{
    if(precomp){
      const currentTick = tickRef.current !== null ? tickRef.current : precomp.gStart;
      const d = precomp.dataPerTick[currentTick];
      if(d) render(d.points, d.colors, d.centroids, precomp.driftTicks, currentTick);
      else render();
    } else {
      render();
    }
  },[render, theme, trajectories, currentSegments, currentPath, currentColor, drawing, selectedFeatures, featureStep, precomp, tick, isAnimating, featureTransforms]);
  
  const calcFeatureVals = useCallback((x, y) => {
    if(numExtraFeatures === 0) return [];
    const positions = getMoorePositions(numExtraFeatures);
    return positions.map(([dx, dy]) => {
      const fx = x + dx * featureStep;
      const fy = y + dy * featureStep;
      return Math.max(-1, Math.min(1, (fx + fy) / 2));
    });
  }, [numExtraFeatures, featureStep]);

  const getFeatureValAtCentroid = useCallback((cx, cy, fi) => {
    const positions = getMoorePositions(fi + 1);
    const [dx, dy] = positions[fi];
    const fx = cx + dx * featureStep;
    const fy = cy + dy * featureStep;
    return Math.max(-1, Math.min(1, (fx + fy) / 2));
  }, [featureStep]);
  
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

    const copies = valid.map(s => {
      const firstPt = s.type==='point' ? s.path[0] : s.path[0];
      const featureVals = calcFeatureVals(firstPt.x, firstPt.y);
      return {...s, featureVals};
    });

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
    setSelectedFeatures(new Set());
    selectedFeaturesRef.current = new Set();
    setStatus({msg:"Cleaned.",color:"#22c55e"});
  },[]);

  const updateDensityRules = useCallback((trajIdx, rules) => {
    setTrajectories(prev => {
      const updated = [...prev];
      updated[trajIdx] = {...updated[trajIdx], densityRules: rules};
      return updated;
    });
  }, []);

  const removeCluster = useCallback((trajIdx) => {
    setTrajectories(prev => prev.filter((_, i) => i !== trajIdx));
    setPrecomp(null);
    setTick(null);
    if(animRef.current) clearTimeout(animRef.current);
    setIsAnimating(false);
    setStatus({msg:`Cluster ${trajIdx} removed.`, color:"#22c55e"});
  }, []);

  const openDensityModal = useCallback((trajIdx) => {
    const rules = trajectories[trajIdx]?.densityRules || [];
    setEditingRules([...rules]);
    setDensityModal({trajIdx});
  }, [trajectories]);

  const saveDensityRules = useCallback(() => {
    if(densityModal===null) return;
    updateDensityRules(densityModal.trajIdx, editingRules);
    setDensityModal(null);
  }, [densityModal, editingRules, updateDensityRules]);

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
    let allT=[...trajectories];
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
      allT=[...allT,{id:Date.now(),segments:copies,startTime,endTime,color:col,featureCentroids:[],densityRules:[]}];
      setTrajectories(allT);setCurrentSegments([]);setCurrentPath([]);setCurrentColor(null);
    }

    if(!allT.length){setStatus({msg:"No cluster!",color:"#ef4444"});return;}
    setStatus({msg:"Computing...",color:"#94a3b8"});
    const darkCanvas=themeRef.current.canvasBg==="#080c14";
    console.log('allT densityRules:', allT.map(t => t.densityRules));
    const res = precomputeData(allT, {std, pts, distType, labelMode, mlRadius, numExtraFeatures, darkCanvas, featureStep, featureTransforms});
    if(!res){setStatus({msg:"Error.",color:"#ef4444"});return;}
    setPrecomp(res);setIsAnimating(true);tickRef.current=res.gStart;setTick(res.gStart);
    setStatus({msg:"Animating...",color:"#3b82f6"});
  },[trajectories,currentSegments,currentPath,startTime,endTime,overlapDur,currentColor,std,pts,distType,labelMode,mlRadius,numExtraFeatures,featureStep,featureTransforms]);


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
    const txt = makeMetaTXT( trajRef.current, precomp.driftTicks, numExtraFeatures, trainPct, labelMode, precomp.pointClass );    const base = filename.endsWith(".csv") ? filename.replace(".csv","") : filename;
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

  // ─── Sub-componentes UI (wrappers que passam theme) ──────────────────────────
  const NI = useMemo(() => (props) => <NumInput {...props} theme={theme}/>, [theme]);
  const SI = useMemo(() => (props) => <SliderInput {...props} theme={theme}/>, [theme]);
  const RI = useMemo(() => (props) => <RadioUI {...props} theme={theme}/>, [theme]);
  const IB = useMemo(() => (props) => <IBtn {...props} theme={theme}/>, [theme]);

  const SectionHeader = ({skey, label, badge}) => (
    <div onClick={() => toggleSection(skey)}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        cursor:"pointer",paddingBottom:8,
        marginBottom: openSections[skey] ? 6 : 0,
        borderBottom: openSections[skey] ? `1px solid ${theme.border}` : "none",
        userSelect:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
          textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</span>
        {badge && <span style={{fontSize:9,color:"#f5a623",fontFamily:"monospace"}}>{badge}</span>}
      </div>
      <span style={{fontSize:9,color:theme.textFaint,
        display:"inline-block",transition:"transform 0.2s",
        transform: openSections[skey] ? "rotate(0deg)" : "rotate(-90deg)"}}>▾</span>
    </div>
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:theme.bg,fontFamily:"'Segoe UI',sans-serif",color:theme.text,overflow:"hidden"}}>

      {/* ── Header fixo ── */}
      <div style={{height:44,background:theme.toolbarBg,borderBottom:`1px solid ${theme.border}`,
        display:"flex",alignItems:"center",padding:"0 16px",gap:10,flexShrink:0,zIndex:10}}>
         <div style={{}}>
          <div style={{fontSize:15,fontWeight:800,color:theme.text}}>Stream<span style={{color:"#3b82f6"}}>Gen</span></div>
          <div style={{fontSize:9,color:theme.label,fontFamily:"monospace",marginTop:2,letterSpacing:"0.08em"}}>STREAM GENERATOR</div>
        </div> 
        <div style={{flex:1}}/>
        <button onClick={()=>setShowSettings(true)} title="Settings"
          style={{width:30,height:30,borderRadius:6,border:`1px solid ${theme.border}`,
            background:"transparent",color:theme.textMuted,display:"flex",alignItems:"center",
            justifyContent:"center",cursor:"pointer",fontSize:14}}>
          ⚙
        </button>
        <button onClick={()=>setShowHelp(true)}
          style={{height:30,padding:"0 10px",borderRadius:6,border:`1px solid ${theme.border}`,
            background:"transparent",color:theme.textMuted,fontSize:10,cursor:"pointer",
            fontFamily:"monospace"}}>
            ? 
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{display:"flex",flex:1,minHeight:0}}>

        {/* ── Sidebar ── */}
        <div style={{width:268,minWidth:"10%",background:theme.sidebar,borderRight:`1px solid ${theme.border}`,display:"flex",flexDirection:"column",padding:"12px 14px",overflowY:"auto"}}>

          

          {/* ── Stream Parameters button ── */}
          <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:10,marginTop:2,marginBottom:4}}>
            <button onClick={()=>{ setParamsUnlocked(false); setUnlockConfirm(false); setShowStreamParams(true); }}
              style={{width:"100%",padding:"7px 10px",borderRadius:7,
                border:`1px solid ${theme.btnBd}`,background:"transparent",
                color:theme.textDim,fontSize:11,cursor:"pointer",fontFamily:"monospace",
                display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span>⚙ Stream Parameters</span>
              <span style={{fontSize:9,color:theme.textFaint}}>
                {labelMode==="multilabel"?"ML":"MC"} · σ={std} · {pts}inst · {numExtraFeatures}f
              </span>
            </button>
          </div>

          {/* ── Extra Features highlight (only when locked) ── */}
          {numExtraFeatures>0&&(
            <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:10,marginTop:2,marginBottom:4}}>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:6,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Highlight features
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {["f1","f2"].map(f=>(
                  <div key={f} style={{padding:"2px 8px",borderRadius:4,fontSize:9,
                    fontFamily:"monospace",background:theme.cardBg,
                    border:`1px solid ${theme.cardBorder}`,color:theme.textFaint}}>
                    {f}
                  </div>
                ))}
                {Array.from({length:numExtraFeatures},(_,i)=>{
                  const fi = i;
                  const color = FEATURE_COLORS[fi % FEATURE_COLORS.length];
                  const selected = selectedFeatures.has(fi);
                  return (
                    <button key={fi} onClick={()=>toggleFeature(fi)}
                      style={{padding:"2px 8px",borderRadius:4,fontSize:9,
                        fontFamily:"monospace",cursor:"pointer",
                        border:`1px solid ${selected?color:theme.cardBorder}`,
                        background:selected?`${color}22`:"transparent",
                        color:selected?color:theme.textDim,
                        transition:"all 0.15s"}}>
                      f{i+3}
                    </button>
                  );
                })}
              </div>
              {selectedFeatures.size > 0 && (
                <>
                  <button onClick={()=>{ setSelectedFeatures(new Set()); selectedFeaturesRef.current = new Set(); setHoveredFeatureVal(null); }}
                    style={{marginTop:6,fontSize:9,fontFamily:"monospace",
                      background:"transparent",border:"none",
                      color:theme.textFaint,cursor:"pointer",padding:0}}>
                    ✕ clear
                  </button>

                  {/* Valor da feature no centroide atual */}
                  {(() => {
                    // ── Static Feature Values ──────────────────────────────
                    if(!precomp){
                      if(!trajectories.length) return null;
                      return (
                        <div style={{marginTop:8,borderTop:`1px solid ${theme.border}`,paddingTop:8}}>
                          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>
                            Feature values (static)
                          </div>
                          {trajectories.map((traj, ti) => {
                            const seg = traj.segments[0];
                            if(!seg) return null;
                            const c = seg.path[0];
                            return (
                              <div key={ti} style={{marginBottom:6}}>
                                <div style={{fontSize:9,color:theme.textDim,fontFamily:"monospace",marginBottom:3}}>
                                  C{ti} ({c.x.toFixed(2)}, {c.y.toFixed(2)})
                                </div>
                                {[...selectedFeatures].map(fi => {
                                  const val = getFeatureValAtCentroid(c.x, c.y, fi);
                                  const fc = FEATURE_COLORS[fi % FEATURE_COLORS.length];
                                  return (
                                    <div key={fi} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                      <div style={{width:6,height:6,borderRadius:1,transform:"rotate(45deg)",
                                        background:fc,flexShrink:0}}/>
                                      <span style={{fontSize:9,fontFamily:"monospace",color:fc,fontWeight:700}}>
                                        f{fi+3}:
                                      </span>
                                      <span style={{fontSize:9,fontFamily:"monospace",color:theme.textMuted}}>
                                        {val !== null ? val.toFixed(4) : "—"}
                                      </span>
                                      <button onClick={(e)=>{ e.stopPropagation(); setFeatureConfigModal(fi); }}
                                        style={{background:"transparent",border:`1px solid ${theme.cardBorder}`,
                                          borderRadius:4,color:theme.textFaint,cursor:"pointer",
                                          fontSize:9,padding:"1px 5px",fontFamily:"monospace"}}>
                                        ⚙
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    // ── Modo animado/pós-geração ─────────────────────────────────────
                    const currentTick = tick !== null ? tick : precomp.gStart;
                    const d = precomp.dataPerTick[currentTick];
                    if(!d || !d.centroids?.length) return null;
                    return (
                      <div style={{marginTop:8,borderTop:`1px solid ${theme.border}`,paddingTop:8}}>
                        <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                          textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>
                          Feature values at t={currentTick}
                        </div>
                        {d.centroids.map((cen, ti) => (
                          <div key={ti} style={{marginBottom:6}}>
                            <div style={{fontSize:9,color:theme.textDim,fontFamily:"monospace",marginBottom:3}}>
                              C{ti} ({cen.x.toFixed(2)}, {cen.y.toFixed(2)})
                            </div>
                            {[...selectedFeatures].map(fi => {
                              const val = getFeatureValAtCentroid(cen.x, cen.y, fi);
                              const fc = FEATURE_COLORS[fi % FEATURE_COLORS.length];
                              return (
                                <div key={fi} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                  <div style={{width:6,height:6,borderRadius:1,transform:"rotate(45deg)",
                                    background:fc,flexShrink:0}}/>
                                  <span style={{fontSize:9,fontFamily:"monospace",color:fc,fontWeight:700}}>
                                    f{fi+3}:
                                  </span>
                                  <span style={{fontSize:9,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
                                    {val !== null ? val.toFixed(4) : "—"}
                                  </span>
                                  <button onClick={()=>setFeatureConfigModal(fi)}
                                    style={{background:"transparent",border:`1px solid ${theme.cardBorder}`,
                                      borderRadius:4,color:theme.textFaint,cursor:"pointer",
                                      fontSize:9,padding:"1px 5px",fontFamily:"monospace"}}>
                                    ⚙
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ── Segments under construction ── */}
          {currentSegments.length>0&&(
            <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:10,marginTop:4}}>
              <SectionHeader skey="segments" label="Segments under construction"/>
              {openSections.segments && (
                <>
                  {currentSegments.map((seg,i)=>{
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
                        <NI l="Transition Duration" v={clampedOverlap}
                          set={v => setOverlapDur(Math.min(v, maxOverlap))}
                          min={0} max={maxOverlap} integer u=" t" help="Determine the duration of the change when there are disconnected segments."/> 
                          {overlapIsTooShort && (
                            <div style={{fontSize:9,fontFamily:"monospace",color:"#f87171",marginTop:2,marginBottom:4,padding:"4px 8px",borderRadius:5,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)"}}>
                              ⚠ Overlap too short for gradual drift. Recommended: minimum {minRecommended}t ({Math.round(minRecommended/streamDuration*100)}% of the stream).
                            </div>
                          )}
                          {clampedOverlap > 0 && (
                            <div style={{fontSize:9,fontFamily:"monospace",color:"#fbbf24",marginTop:2,marginBottom:4,lineHeight:1.6}}>
                              〰 Coexistence: t={coStart} → t={coEnd} ({clampedOverlap}t)
                              <br/>
                              <span style={{color:theme.textFaint}}>Transition point: t={mid} (midpoint)</span>
                            </div>
                          )}
                          {maxOverlap > 0 && (
                            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:4}}>
                              Maximum possible: {maxOverlap}t · Recommended minimum: {minRecommended}t
                            </div>
                          )}
                          <div style={{fontSize:10,fontFamily:"monospace",color:typeColor,marginTop:2,marginBottom:4}}>
                            {clampedOverlap===0 ? "⚡ Abrupt" : overlapIsTooShort ? "⚠ Too short for Gradual" : `〰 Gradual · ${clampedOverlap}t overlap`}
                          </div>
                      </div>
                    );
                  })()}

                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Detected type:</span>
                    <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:typeColor}}>{inferredType}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Clusters finalizados ── */}
          {trajectories.length>0&&(
            <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:10,marginTop:14}}>
              <SectionHeader skey="clusters" label={`Clusters (${trajectories.length})`}/>
              {openSections.clusters && trajectories.map((t,i)=>(
                <div key={t.id} style={{marginBottom:7,padding:"5px 8px",borderRadius:6,
                  border:`1px solid ${theme.cardBorder}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:t.segments.length>1?6:0}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                    <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",flex:1}}>
                      C{i} · {t.startTime}→{t.endTime} · {t.segments.length} seg
                    </span>
                    <button
                      onClick={()=>openDensityModal(i)}
                      title="Frequency rules"
                      style={{background:"transparent",border:`1px solid ${theme.cardBorder}`,
                        borderRadius:4,color:t.densityRules?.length>0?"#f5a623":theme.textFaint,
                        cursor:"pointer",fontSize:10,padding:"1px 6px",fontFamily:"monospace"}}>
                      ⚙
                    </button>
                    <button
                      onClick={()=>removeCluster(i)}
                      title="Remove cluster"
                      style={{background:"transparent",border:`1px solid ${theme.cardBorder}`,
                        borderRadius:4,color:"#f87171",cursor:"pointer",
                        fontSize:10,padding:"1px 6px",fontFamily:"monospace"}}>
                      ✕
                    </button>
                  </div>
                  {t.segments.map((seg,si)=>(
                    <div key={si} style={{display:"flex",alignItems:"center",gap:4,marginLeft:16,marginTop:3}}>
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
                  {t.densityRules?.length>0&&(
                    <div style={{marginLeft:16,marginTop:4,fontSize:8,color:"#f5a623",fontFamily:"monospace"}}>
                      ⚡ {t.densityRules.length} density rule{t.densityRules.length>1?"s":""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{flex:1}}/>
        </div>

        {/* ── Main ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

          {/* Toolbar */}
          <div style={{height:46,background:theme.toolbarBg,borderBottom:`1px solid ${theme.border}`,display:"flex",alignItems:"center",padding:"0 14px",gap:6}}>
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
            <IB onClick={finishCluster} title="Finish Cluster" accent>＋</IB>
            <IB onClick={preview} title="Preview">◎</IB>
            <IB onClick={undo} title="Undo">↩</IB>
            <IB onClick={clearAll} title="Clear All" danger>✕</IB>
            <div style={{width:1,height:20,background:theme.border,margin:"0 2px"}}/>
            <button onClick={isAnimating?stopAnim:generate} style={{padding:"7px 16px",borderRadius:7,border:`1px solid ${theme.bdGen}`,background:isAnimating?"#7f1d1d":theme.bg,color:isAnimating?"#fca5a5":theme.texGen,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
              {isAnimating?"⏹ Stop":"▶ Generate Stream"}
            </button>

            <button onClick={()=>setShowExport(true)}
              style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${theme.btnBd}`,
                background:"transparent",color:theme.textDim,fontSize:11,cursor:"pointer",
                fontFamily:"monospace",display:"flex",alignItems:"center",gap:6}}>
              ⬇ Export
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

      </div>{/* ── End Body ── */}

      {/* ── Density Modal ── */}
      {densityModal&&(
        <DensityModal
          key={`density-${densityModal.trajIdx}`}
          traj={trajectories[densityModal.trajIdx]}
          trajIdx={densityModal.trajIdx}
          defaultPts={pts}
          theme={theme}
          rules={editingRules}
          onAddRule={r => setEditingRules(prev => [...prev, r])}
          onRemoveRule={ri => setEditingRules(prev => prev.filter((_,i) => i !== ri))}
          onClose={()=>setDensityModal(null)}
          onSave={saveDensityRules}
        />
      )}

      {/* ── Export Modal ── */}
      {showExport&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
          justifyContent:"center",zIndex:200}}
          onClick={()=>setShowExport(false)}>
          <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
            borderRadius:14,padding:24,maxWidth:400,width:"90%"}}
            onClick={e=>e.stopPropagation()}>

            <div style={{fontSize:13,fontWeight:700,color:theme.text,marginBottom:4}}>Export</div>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:16,lineHeight:1.6}}>
              {precomp ? "Stream ready to export." : "⚠ Generate a stream first."}
            </div>

            {/* Dataset section */}
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
              Dataset
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {/* CSV */}
              <div style={{background:theme.cardBg,border:`1px solid ${theme.cardBorder}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,fontWeight:600,color:theme.textMuted,fontFamily:"monospace",marginBottom:8}}>CSV</div>
                <button onClick={()=>{ downloadCSVComplete(); setShowExport(false); }}
                  style={{width:"100%",padding:"5px 8px",borderRadius:5,border:`1px solid ${theme.border}`,
                    background:"transparent",color:theme.textDim,fontSize:10,cursor:"pointer",
                    fontFamily:"monospace",textAlign:"left",marginBottom:4}}>
                  ⬇ Complete
                </button>
                <button onClick={()=>{ downloadCSV(); setShowExport(false); }}
                  style={{width:"100%",padding:"5px 8px",borderRadius:5,border:`1px solid ${theme.border}`,
                    background:"transparent",color:theme.textDim,fontSize:10,cursor:"pointer",
                    fontFamily:"monospace",textAlign:"left"}}>
                  ⬇ Train / Test Split
                </button>
              </div>
              {/* ARFF */}
              <div style={{background:theme.cardBg,border:`1px solid ${theme.cardBorder}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,fontWeight:600,color:theme.textMuted,fontFamily:"monospace",marginBottom:8}}>ARFF</div>
                <button onClick={()=>{ downloadARFFComplete(); setShowExport(false); }}
                  style={{width:"100%",padding:"5px 8px",borderRadius:5,border:`1px solid ${theme.border}`,
                    background:"transparent",color:theme.textDim,fontSize:10,cursor:"pointer",
                    fontFamily:"monospace",textAlign:"left",marginBottom:4}}>
                  ⬇ Complete
                </button>
                <button onClick={()=>{ downloadARFF(); setShowExport(false); }}
                  style={{width:"100%",padding:"5px 8px",borderRadius:5,border:`1px solid ${theme.border}`,
                    background:"transparent",color:theme.textDim,fontSize:10,cursor:"pointer",
                    fontFamily:"monospace",textAlign:"left"}}>
                  ⬇ Train / Test Split
                </button>
              </div>
            </div>

            {/* Extra info */}
            <div style={{background:theme.cardBg,border:`1px solid ${theme.cardBorder}`,borderRadius:6,
              padding:"6px 10px",marginBottom:14,fontSize:9,fontFamily:"monospace",color:theme.textFaint,lineHeight:1.7}}>
              Train: {trainPct}% · Test: {100-trainPct}% · File: {filename}
              {numExtraFeatures>0 && ` · ${numExtraFeatures+2} features`}
            </div>

            {/* Metadata & Canvas section */}
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
              Metadata & Canvas
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <button onClick={()=>{ downloadMeta(); setShowExport(false); }}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${theme.cardBorder}`,
                  background:theme.cardBg,color:theme.textDim,fontSize:10,cursor:"pointer",
                  fontFamily:"monospace",textAlign:"left"}}>
                ⬇ META.txt
              </button>
              <button onClick={()=>{ downloadImage(); setShowExport(false); }}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${theme.cardBorder}`,
                  background:theme.cardBg,color:theme.textDim,fontSize:10,cursor:"pointer",
                  fontFamily:"monospace",textAlign:"left"}}>
                ⬇ PNG
              </button>
            </div>

            <button onClick={()=>setShowExport(false)}
              style={{width:"100%",padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,
                background:"transparent",color:theme.textDim,cursor:"pointer",
                fontSize:11,fontFamily:"monospace"}}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
          justifyContent:"center",zIndex:200}}
          onClick={()=>setShowSettings(false)}>
          <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
            borderRadius:14,padding:24,maxWidth:340,width:"90%"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:13,fontWeight:700,color:theme.text,marginBottom:16}}>Settings</div>

            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Theme</div>
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[["☀️ Light",true],["🌙 Dark",false]].map(([lbl,val])=>(
                <button key={lbl} onClick={()=>setDarkMode(val)}
                  style={{flex:1,padding:"7px",borderRadius:7,fontSize:11,cursor:"pointer",
                    fontFamily:"monospace",border:`1px solid ${theme.border}`,
                    background:darkMode===val?"rgba(59,130,246,0.15)":"transparent",
                    color:darkMode===val?"#93c5fd":theme.textDim}}>
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Animation Speed</div>
            <SI l="" min={10} max={500} step={10} v={speed} set={setSpeed} decimals={0} u="ms/tick"/>

            <button onClick={()=>setShowSettings(false)}
              style={{marginTop:8,width:"100%",padding:"7px",borderRadius:7,
                border:`1px solid ${theme.border}`,background:"transparent",
                color:theme.textDim,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Stream Parameters Modal ── */}
      {showStreamParams&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
          justifyContent:"center",zIndex:200}}
          onClick={()=>{ setShowStreamParams(false); setParamsUnlocked(false); setUnlockConfirm(false); }}>
          <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
            borderRadius:14,padding:24,maxWidth:440,width:"90%",maxHeight:"88vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>

            <div style={{fontSize:13,fontWeight:700,color:theme.text,marginBottom:4}}>
              Stream Parameters
            </div>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:14,lineHeight:1.6}}>
              Global settings — apply to all clusters.
            </div>

            {/* Lock warning */}
            {isLocked&&!paramsUnlocked&&(
              <div style={{background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.25)",
                borderRadius:8,padding:"10px 12px",marginBottom:14}}>
                <div style={{fontSize:10,color:"#fbbf24",fontFamily:"monospace",marginBottom:8,lineHeight:1.5}}>
                  ⚠ You have clusters drawn. Changing global parameters will require regenerating the stream.
                </div>
                {!unlockConfirm ? (
                  <button onClick={()=>setUnlockConfirm(true)}
                    style={{padding:"5px 12px",borderRadius:6,border:"1px solid rgba(251,191,36,0.4)",
                      background:"transparent",color:"#fbbf24",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                    🔓 Unlock to edit
                  </button>
                ):(
                  <div>
                    <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:8}}>
                      Are you sure? The stream will need to be regenerated.
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{ setParamsUnlocked(true); setUnlockConfirm(false); setPrecomp(null); }}
                        style={{flex:1,padding:"5px",borderRadius:6,border:"none",
                          background:"rgba(239,68,68,0.2)",color:"#fca5a5",
                          fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                        Yes, unlock
                      </button>
                      <button onClick={()=>setUnlockConfirm(false)}
                        style={{flex:1,padding:"5px",borderRadius:6,
                          border:`1px solid ${theme.border}`,background:"transparent",
                          color:theme.textDim,fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parameters — disabled when locked */}
            {(()=>{
              const disabled = isLocked && !paramsUnlocked;
              const fieldStyle = {opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? "none" : "auto"};
              return (
                <>
                  <div style={fieldStyle}>
                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                      textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:4}}>
                      Distribution
                    </div>
                    <RI label="" opts={["Gaussian","RandomRBF"]} val={distType} set={setDistType}/>

                    <SI l="Standard Deviation" min={0} max={0.5} step={0.005} v={std} set={setStd} decimals={3}
                      help="Controls the spread of generated instances around the centroid. Higher values = more dispersed points."/>

                    <NI l="Instances per Centroid" v={pts} set={setPts} min={1} max={5000} integer/>

                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                      textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:8}}>
                      Label Mode
                    </div>
                    <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,
                      border:`1px solid ${theme.border}`,marginBottom:10}}>
                      {[["multiclass","Multiclass"],["multilabel","Multi-Label"]].map(([mode,lbl])=>(
                        <button key={mode} onClick={()=>setLabelMode(mode)} style={{
                          flex:1,padding:"6px 4px",borderRadius:6,border:"none",fontSize:10,cursor:"pointer",
                          fontFamily:"monospace",fontWeight:mode===labelMode?700:400,
                          background:mode===labelMode?(mode==="multilabel"?"rgba(168,85,247,0.2)":"rgba(59,130,246,0.15)"):"transparent",
                          color:mode===labelMode?(mode==="multilabel"?"#c084fc":"#93c5fd"):theme.textDim,
                          transition:"all 0.15s"
                        }}>{lbl}</button>
                      ))}
                    </div>
                    {labelMode==='multilabel'&&(
                      <div style={{background:"rgba(168,85,247,0.05)",border:"1px solid rgba(168,85,247,0.15)",borderRadius:7,padding:"10px 10px 6px",marginBottom:10}}>
                        <SI l="Radius (N×σ)" min={1} max={6} step={0.1} v={mlRadius} set={setMlRadius} decimals={1} u="σ" help={`Defines the overlap radius between clusters in multi-label mode. \n\nHigher N → larger overlap zone → more multi-label instances.\nLower N → smaller overlap zone → fewer multi-label instances.`}/>
                        <div style={{fontSize:10,fontFamily:"monospace",color:"#c084fc",marginTop:-6,marginBottom:4}}>
                          radius = {(mlRadius*std).toFixed(4)} u
                        </div>
                      </div>
                    )}

                    <NI l="Extra features" v={numExtraFeatures}
                      set={setNumExtraFeatures} min={0} max={10} integer
                      disabled={isLocked && !paramsUnlocked}
                       help="Number of additional feature dimensions generated around the centroid using Moore neighborhood positioning."/>
                      {numExtraFeatures>0&&(
                        <div style={{fontSize:9,color:"#f5a623",fontFamily:"monospace",marginTop:-8,marginBottom:10}}>
                          f1, f2{Array.from({length:numExtraFeatures},(_,i)=>`, f${i+3}`).join("")}
                        </div>
                      )}
                      {numExtraFeatures > 0 && (
                        <SI l="Feature Step" min={0.01} max={0.5} step={0.01}
                          v={featureStep} set={setFeatureStep} decimals={2}
                           help="Distance between the main centroid and each extra feature position in the canvas space [-1, 1]."
                        />
                    )}

                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                      textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:4}}>
                      Temporal Window
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      {[["Start",startTime,setStartTime],["End",endTime,setEndTime]].map(([lbl,val,set])=>(
                        <div key={lbl} style={{flex:1}}>
                          <div style={{fontSize:9,color:theme.textFaint,marginBottom:4,fontFamily:"monospace"}}>{lbl}</div>
                          <input type="number" value={val} onChange={e=>set(parseInt(e.target.value)||0)}
                            style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                              color:theme.textMuted,borderRadius:6,padding:"4px 7px",fontSize:11,
                              fontFamily:"monospace",boxSizing:"border-box"}}/>
                        </div>
                      ))}
                    </div>

                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
                      textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
                      Dataset Split
                    </div>
                    <NI l="Train %" v={trainPct} set={setTrainPct} min={10} max={90} integer
                    help="Percentage of instances assigned to the training partition. The remaining go to test."/>
                    
                    <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:5}}>Filename</div>
                    <input value={filename} onChange={e=>setFilename(e.target.value)}
                      style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                        color:theme.textMuted,borderRadius:6,padding:"4px 7px",fontSize:11,
                        fontFamily:"monospace",boxSizing:"border-box",marginBottom:14}}/>
                  </div>

                  <button onClick={()=>{ setShowStreamParams(false); setParamsUnlocked(false); setUnlockConfirm(false); }}
                    style={{width:"100%",padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,
                      background:"transparent",color:theme.textDim,cursor:"pointer",
                      fontSize:11,fontFamily:"monospace"}}>
                    Close
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

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
              ["〰 Overlap","With 2+ free segments and overlap > 0 — Gradual drift."],
              ["● Multi-Label","Points within the radius (N×σ) of another cluster receive multiple labels."],
              ["Output","Complete/Split: CSV/ARFF."],
              ["▶ Generate","Animates and computes the dataset."],
              ["META / PNG","Downloads the dataset metadata / Downloads canvas image."],
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

      {/* ── Feature Config Modal ── */}
      {featureConfigModal !== null && (
        <FeatureConfigModal
          fi={featureConfigModal}
          trajs={trajectories}
          transforms={featureTransforms}
          onChange={(fi, ti, field, val) => {
            setFeatureTransforms(prev => ({
              ...prev,
              [fi]: { ...(prev[fi]??{}), [ti]: { ...(prev[fi]?.[ti]??{factor:1,offset:0}), [field]: val }}
            }));
          }}
          onClose={()=>setFeatureConfigModal(null)}
          theme={theme}
        />
      )}
    </div>
  );
}