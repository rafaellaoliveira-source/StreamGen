// ─── components/LabelSpaceModal.jsx ──────────────────────────────────────────
import { useState, useMemo } from "react";
import { calcTransitionDuration, calcChangePerTick, inferAttributionDriftType, validateAttributionRule, calcStartEndFromMidpoint } from "../utils/attributionUtils.js";

const STRATEGIES = [["first","First"],["last","Last"],["both","Both"],["random","Random"]];

const EMPTY_ATTR_RULE = {
  subLabelIndex: 1,
  initialInstances: '',
  finalInstances: '',
  changePerTick: '',
  tStart: '',
  tEnd: '',
};

export default function LabelSpaceModal({
  ti, traj, theme,
  globalSubLabels, globalActive, globalStrategy,
  pts, startTime, endTime,
  onSave, onClose
}) {
  // ── Label Space config ──────────────────────────────────────────────────────
  const [localCfg, setLocalCfg] = useState(() => traj.labelConfig ?? {
    subLabels:    globalSubLabels,
    activeLabels: globalSubLabels, // all active by default
    strategy:     globalStrategy,
  });

  // ── Label Space Rules (temporal) ────────────────────────────────────────────
  const [localRules, setLocalRules] = useState(() => traj.labelSpaceRules ?? []);
  const [newRule, setNewRule] = useState({tStart:'', tEnd:'', activeLabels:'', strategy:'first'});
  const [ruleError, setRuleError] = useState('');

  // ── Attribution Rules ────────────────────────────────────────────────────────
  const [localAttrRules, setLocalAttrRules] = useState(() => traj.attributionRules ?? []);
  const [newAttrRule, setNewAttrRule] = useState(EMPTY_ATTR_RULE);
  const [attrRuleError, setAttrRuleError] = useState('');

  const validIntervals = traj.segments.map(s => ({tStart: s.tStart, tEnd: s.tEnd}));
  const streamDuration = endTime - startTime;

  const segStart = Math.min(...traj.segments.map(s => s.tStart));
  const segEnd   = Math.max(...traj.segments.map(s => s.tEnd));
  const midpoint = Math.round((segStart + segEnd) / 2);

  const [overlapConfirm, setOverlapConfirm] = useState(false);
  
  // ── Label Space Rule helpers ────────────────────────────────────────────────
  const isValidRule = (r) =>
    validIntervals.some(iv => r.tStart >= iv.tStart && r.tEnd <= iv.tEnd) &&
    r.tStart < r.tEnd && r.activeLabels >= 1 && r.activeLabels <= localCfg.subLabels;

  const addRule = () => {
    const r = {
      tStart:       parseInt(newRule.tStart),
      tEnd:         parseInt(newRule.tEnd),
      activeLabels: parseInt(newRule.activeLabels),
      strategy:     newRule.strategy,
    };
    if(isNaN(r.tStart) || isNaN(r.tEnd) || isNaN(r.activeLabels)){
      setRuleError('All fields are required.'); return;
    }
    if(!isValidRule(r)){
      setRuleError(
        `Active labels must be ≥1 and ≤${localCfg.subLabels}. ` +
        `Range must be within: ${validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}`
      );
      return;
    }
    setRuleError('');
    setLocalRules(prev => [...prev, r]);
    setNewRule({tStart:'', tEnd:'', activeLabels:'', strategy:'first'});
  };

  const detectPatterns = (sugTStart, sugTEnd) => {
    const initial = parseInt(newAttrRule.initialInstances);
    const final   = parseInt(newAttrRule.finalInstances);
    const newDir  = Math.sign(final - initial);
    const patterns = [];
    let hasOverlap = false;
    let overlapRule = null;

    localAttrRules.forEach(existing => {
      const existDir = Math.sign(existing.finalInstances - existing.initialInstances);
      const tS = sugTStart;
      const tE = sugTEnd;

      if(existing.subLabelIndex === parseInt(newAttrRule.subLabelIndex)){
        if(tS < existing.tEnd && tE > existing.tStart){
          hasOverlap = true;
          overlapRule = existing;
        }
        return;
      }

      if(existDir !== 0 && newDir !== 0){
        if(existDir === -newDir){
          patterns.push({ color:'#4ade80', msg:`〰 Gradual · mirrors class_${ti}_${existing.subLabelIndex}` });
        } else {
          patterns.push({ color:'#60a5fa', msg:`↗ Incremental · same direction as class_${ti}_${existing.subLabelIndex}` });
        }
      }
    });

    return { patterns, hasOverlap, overlapRule };
  };

  // ── Attribution Rule helpers ────────────────────────────────────────────────

  const attrCalc = useMemo(() => {
    const initial = parseInt(newAttrRule.initialInstances);
    const final   = parseInt(newAttrRule.finalInstances);
    const change  = parseFloat(newAttrRule.changePerTick);
    const tStart  = parseInt(newAttrRule.tStart);
    const tEnd    = parseInt(newAttrRule.tEnd);

    if(isNaN(initial) || isNaN(final)) return null;

    const diff = Math.abs(final - initial);
    if(diff === 0) return { driftType:{ type:"Stationary", color:"#94a3b8" }, patterns:[], hasOverlap:false, overlapRule:null };

    if(!isNaN(change) && change > 0){
      const { tStart: sugTStart, tEnd: sugTEnd, duration } = calcStartEndFromMidpoint(initial, final, change, midpoint);
      const driftType = inferAttributionDriftType(initial, final, change, streamDuration);
      const { patterns, hasOverlap, overlapRule } = detectPatterns(
        isNaN(tStart) ? sugTStart : tStart,
        isNaN(tEnd)   ? sugTEnd   : tEnd
      );
      return { driftType, duration, sugTStart, sugTEnd, suggestedChange: null, showSuggestedRange: isNaN(tStart) || isNaN(tEnd), patterns, hasOverlap, overlapRule };
    }

    if(!isNaN(tStart) && !isNaN(tEnd) && tEnd > tStart){
      const duration = tEnd - tStart;
      const suggestedChange = calcChangePerTick(initial, final, duration);
      const driftType = inferAttributionDriftType(initial, final, suggestedChange, streamDuration);
      const { patterns, hasOverlap, overlapRule } = detectPatterns(tStart, tEnd);
      return { driftType, duration, sugTStart: tStart, sugTEnd: tEnd, suggestedChange, showSuggestedRange: false, patterns, hasOverlap, overlapRule };
    }

    return { diff, driftType: null, suggestedChange: null, showSuggestedRange: false, patterns: [], hasOverlap: false, overlapRule: null };
  }, [newAttrRule, streamDuration, midpoint, localAttrRules]);

  const addAttrRule = () => {
    const r = {
      subLabelIndex:    parseInt(newAttrRule.subLabelIndex),
      initialInstances: parseInt(newAttrRule.initialInstances),
      finalInstances:   parseInt(newAttrRule.finalInstances),
      changePerTick:    parseFloat(newAttrRule.changePerTick),
      tStart:           attrCalc?.sugTStart ?? parseInt(newAttrRule.tStart),
      tEnd:             attrCalc?.sugTEnd   ?? parseInt(newAttrRule.tEnd),
    };

    if(Object.values(r).some(v => isNaN(v))){
      setAttrRuleError('All fields are required.'); return;
    }

    const warnings = validateAttributionRule(r, pts, streamDuration, validIntervals);
    if(warnings.length > 0){
      setAttrRuleError(warnings[0]); return;
    }

    if(attrCalc?.hasOverlap && !overlapConfirm){
      setOverlapConfirm(true);
      return;
    }

    setAttrRuleError('');
    setOverlapConfirm(false);
    setLocalAttrRules(prev => [...prev, r]);
    setNewAttrRule(EMPTY_ATTR_RULE);
  };

  // ── Sub-label options for the attribution rule selector ────────────────────
  const subLabelOptions = Array.from(
    {length: localCfg.subLabels}, (_, i) => i + 1
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
      justifyContent:"center",zIndex:200}}
      onClick={onClose}>
      <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
        borderRadius:14,padding:24,maxWidth:480,width:"90%",maxHeight:"90vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:traj.color,flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:700,color:theme.text}}>
            C{ti} — Label Frequency
          </span>
        </div>

        {/* ── Base config ── */}
        <div style={{background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.15)",
          borderRadius:8,padding:"12px",marginBottom:14}}>

          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:4}}>
                Total sub-labels
              </div>
              <input type="number" value={localCfg.subLabels} min={1} max={200}
                onChange={e=>{
                  const v = Math.max(1, parseInt(e.target.value)||1);
                  setLocalCfg(prev=>({...prev, subLabels:v, activeLabels:Math.min(prev.activeLabels, v)}));
                }}
                style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                  color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                  fontFamily:"monospace",boxSizing:"border-box"}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:4}}>
                Active per instance
              </div>
              <input type="number" value={localCfg.activeLabels} min={1} max={localCfg.subLabels}
                onChange={e=>{
                  const v = Math.max(1, Math.min(localCfg.subLabels, parseInt(e.target.value)||1));
                  setLocalCfg(prev=>({...prev, activeLabels:v}));
                }}
                style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                  color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                  fontFamily:"monospace",boxSizing:"border-box"}}/>
            </div>
          </div>

          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:6}}>
            Strategy — which sub-labels are active
          </div>
          <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,
            border:`1px solid ${theme.border}`,marginBottom:8}}>
            {STRATEGIES.map(([s,lbl])=>(
              <button key={s} onClick={()=>setLocalCfg(prev=>({...prev,strategy:s}))}
                style={{flex:1,padding:"5px 4px",borderRadius:6,border:"none",fontSize:9,
                  cursor:"pointer",fontFamily:"monospace",
                  background:localCfg.strategy===s?"rgba(34,197,94,0.2)":"transparent",
                  color:localCfg.strategy===s?"#4ade80":theme.textDim,
                  fontWeight:localCfg.strategy===s?700:400,transition:"all 0.15s"}}>
                {lbl}
              </button>
            ))}
          </div>

          <div style={{fontSize:9,color:"#4ade80",fontFamily:"monospace"}}>
            {localCfg.activeLabels} of {localCfg.subLabels} sub-labels active
            {" · "}columns: class_{ti}_1 … class_{ti}_{localCfg.subLabels}
          </div>
        </div>

        {/* ── Label Frequency Rules ── */}
        <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
          textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
          Label Frequency Rules
        </div>
        <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:10,lineHeight:1.6}}>
          Valid intervals: {validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}
        </div>

        {localRules.length === 0 && (
          <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:10}}>
            No rules — using base config above.
          </div>
        )}

        {localRules.map((r, ri) => (
          <div key={ri} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
            padding:"5px 8px",borderRadius:6,border:`1px solid ${theme.cardBorder}`,
            background:theme.cardBg}}>
            <span style={{fontSize:10,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
              t={r.tStart}→{r.tEnd} · active={r.activeLabels} · {r.strategy}
            </span>
            <button onClick={()=>setLocalRules(prev=>prev.filter((_,i)=>i!==ri))}
              style={{background:"transparent",border:"none",color:"#f87171",
                cursor:"pointer",fontSize:12,padding:0}}>✕</button>
          </div>
        ))}

        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:12,marginTop:8,marginBottom:16}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8}}>
            Add frequency rule
          </div>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {[["t start","tStart"],["t end","tEnd"],["active","activeLabels"]].map(([lbl,key])=>(
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
          <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,
            border:`1px solid ${theme.border}`,marginBottom:8}}>
            {STRATEGIES.map(([s,lbl])=>(
              <button key={s} onClick={()=>setNewRule(prev=>({...prev,strategy:s}))}
                style={{flex:1,padding:"4px",borderRadius:6,border:"none",fontSize:9,
                  cursor:"pointer",fontFamily:"monospace",
                  background:newRule.strategy===s?"rgba(34,197,94,0.2)":"transparent",
                  color:newRule.strategy===s?"#4ade80":theme.textDim,
                  transition:"all 0.15s"}}>
                {lbl}
              </button>
            ))}
          </div>
          {ruleError && (
            <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:6,lineHeight:1.5}}>
              ⚠ {ruleError}
            </div>
          )}
          <button onClick={addRule}
            style={{width:"100%",padding:"6px",borderRadius:6,border:"none",
              background:"rgba(34,197,94,0.15)",color:"#4ade80",
              fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
            + Add frequency rule
          </button>
        </div>

        {/* ── Attribution Rules ── */}
        <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:14,marginBottom:8}}>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
            Attribution Rules
          </div>
          <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:10,lineHeight:1.6}}>
            Control how many instances per tick receive each sub-label.
            By default all instances receive all active sub-labels.
          </div>

          {localAttrRules.length === 0 && (
            <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:10}}>
              No rules — all instances receive all active sub-labels.
            </div>
          )}

          {localAttrRules.map((r, ri) => (
            <div key={ri} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
              padding:"5px 8px",borderRadius:6,border:`1px solid ${theme.cardBorder}`,
              background:theme.cardBg}}>
              <span style={{fontSize:10,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
                class_{ti}_{r.subLabelIndex} · t={r.tStart}→{r.tEnd}
                {" · "}{r.initialInstances}→{r.finalInstances} inst · {r.changePerTick}/tick
              </span>
              <button onClick={()=>setLocalAttrRules(prev=>prev.filter((_,i)=>i!==ri))}
                style={{background:"transparent",border:"none",color:"#f87171",
                  cursor:"pointer",fontSize:12,padding:0}}>✕</button>
            </div>
          ))}

          {/* Add attribution rule form */}
          <div style={{background:"rgba(96,165,250,0.05)",border:"1px solid rgba(96,165,250,0.15)",
            borderRadius:8,padding:"12px",marginTop:8}}>
            <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8}}>
              Add attribution rule
            </div>

            {/* Sub-label selector */}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:8,color:theme.textFaint,fontFamily:"monospace",marginBottom:3}}>
                Sub-label
              </div>
              <select
                value={newAttrRule.subLabelIndex}
                onChange={e=>setNewAttrRule(prev=>({...prev, subLabelIndex:parseInt(e.target.value)}))}
                style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                  color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                  fontFamily:"monospace",boxSizing:"border-box"}}>
                {subLabelOptions.map(i => (
                  <option key={i} value={i}>class_{ti}_{i}</option>
                ))}
              </select>
            </div>

            {/* Initial, Final, Change/tick */}
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[
                ["Initial inst","initialInstances"],
                ["Final inst","finalInstances"],
                ["Change/tick","changePerTick"],
              ].map(([lbl,key])=>(
                <div key={key} style={{flex:1}}>
                  <div style={{fontSize:8,color:theme.textFaint,fontFamily:"monospace",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={newAttrRule[key]} min={0}
                    onChange={e=>setNewAttrRule(prev=>({...prev,[key]:e.target.value}))}
                    style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                      color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                      fontFamily:"monospace",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>

            {/* tStart, tEnd */}
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["t start","tStart"],["t end","tEnd"]].map(([lbl,key])=>(
                <div key={key} style={{flex:1}}>
                  <div style={{fontSize:8,color:theme.textFaint,fontFamily:"monospace",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={newAttrRule[key]}
                    onChange={e=>setNewAttrRule(prev=>({...prev,[key]:e.target.value}))}
                    style={{width:"100%",background:theme.inputBg,border:`1px solid ${theme.cardBorder}`,
                      color:theme.textMuted,borderRadius:5,padding:"4px 6px",fontSize:11,
                      fontFamily:"monospace",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>

            {/* Live calculation feedback */}
            {attrCalc && (
              <div style={{marginBottom:8,padding:"6px 8px",borderRadius:6,
                background:theme.cardBg,border:`1px solid ${theme.cardBorder}`}}>

                {attrCalc.driftType && (
                  <div style={{fontSize:9,fontFamily:"monospace",
                    color:attrCalc.driftType.color,marginBottom:4}}>
                    {attrCalc.driftType.type === "Abrupt" ? "⚡" :
                    attrCalc.driftType.type === "Gradual" ? "〰" :
                    attrCalc.driftType.type === "Incremental" ? "↗" : "⚠"}{" "}
                    {attrCalc.driftType.type}
                    {attrCalc.duration !== undefined && attrCalc.duration !== Infinity &&
                      ` · ${attrCalc.duration} ticks`}
                  </div>
                )}

                {/* Patterns detected */}
                {attrCalc?.patterns?.map((p, pi) => (
                  <div key={pi} style={{fontSize:9,fontFamily:"monospace",
                    color:p.color,marginTop:2}}>
                    {p.msg}
                  </div>
                ))}

                {/* Overlap warning */}
                {attrCalc?.hasOverlap && (
                  <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",
                    marginTop:4,lineHeight:1.5}}>
                    ⚠ class_{ti}_{newAttrRule.subLabelIndex} already has a rule in this interval.
                    Remove it or change t start / t end.
                  </div>
                )}

                {/* Suggest tStart/tEnd */}
                {attrCalc.showSuggestedRange && attrCalc.sugTStart !== undefined && (
                  <div style={{fontSize:9,fontFamily:"monospace",color:theme.textFaint,marginBottom:4}}>
                    Suggested range: t={attrCalc.sugTStart} → t={attrCalc.sugTEnd}
                    {" "}(centered on t={midpoint})
                    <button
                      onClick={()=>setNewAttrRule(prev=>({
                        ...prev,
                        tStart: String(attrCalc.sugTStart),
                        tEnd:   String(attrCalc.sugTEnd),
                      }))}
                      style={{marginLeft:8,background:"transparent",border:`1px solid ${theme.cardBorder}`,
                        borderRadius:4,color:"#93c5fd",cursor:"pointer",fontSize:8,
                        padding:"1px 5px",fontFamily:"monospace"}}>
                      use
                    </button>
                  </div>
                )}

                {/* Suggest changePerTick */}
                {attrCalc.suggestedChange !== null && (
                  <div style={{fontSize:9,fontFamily:"monospace",color:theme.textFaint}}>
                    Suggested change/tick: {attrCalc.suggestedChange}
                    <button
                      onClick={()=>setNewAttrRule(prev=>({
                        ...prev,
                        changePerTick: String(attrCalc.suggestedChange)
                      }))}
                      style={{marginLeft:8,background:"transparent",border:`1px solid ${theme.cardBorder}`,
                        borderRadius:4,color:"#93c5fd",cursor:"pointer",fontSize:8,
                        padding:"1px 5px",fontFamily:"monospace"}}>
                      use
                    </button>
                  </div>
                )}

                {/* Info */}
                {attrCalc.sugTStart !== undefined && attrCalc.sugTEnd !== undefined && (
                  <div style={{fontSize:9,fontFamily:"monospace",color:"#fbbf24",marginTop:2}}>
                    Transition: t={attrCalc.sugTStart} → t={attrCalc.sugTEnd}
                    {" · "}midpoint: t={midpoint}
                  </div>
                )}
              </div>
            )}

            {/* Overlap confirmation */}
            {attrCalc?.hasOverlap && overlapConfirm && (
              <div style={{marginBottom:8,padding:"8px",borderRadius:6,
                background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.25)"}}>
                <div style={{fontSize:9,color:"#fbbf24",fontFamily:"monospace",marginBottom:8,lineHeight:1.5}}>
                  ⚠ class_{ti}_{newAttrRule.subLabelIndex} already has a rule in this interval.
                  What would you like to do?
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button
                    onClick={()=>{
                      // Keep both — add without removing old
                      const r = {
                        subLabelIndex:    parseInt(newAttrRule.subLabelIndex),
                        initialInstances: parseInt(newAttrRule.initialInstances),
                        finalInstances:   parseInt(newAttrRule.finalInstances),
                        changePerTick:    parseFloat(newAttrRule.changePerTick),
                        tStart:           attrCalc?.sugTStart ?? parseInt(newAttrRule.tStart),
                        tEnd:             attrCalc?.sugTEnd   ?? parseInt(newAttrRule.tEnd),
                      };
                      setLocalAttrRules(prev => [...prev, r]);
                      setNewAttrRule(EMPTY_ATTR_RULE);
                      setOverlapConfirm(false);
                      setAttrRuleError('');
                    }}
                    style={{flex:1,padding:"5px",borderRadius:6,border:"none",
                      background:"rgba(34,197,94,0.2)",color:"#4ade80",
                      fontSize:9,cursor:"pointer",fontFamily:"monospace"}}>
                    Keep both
                  </button>
                  <button
                    onClick={()=>{
                      // Replace — remove overlapping rule and add new one
                      const r = {
                        subLabelIndex:    parseInt(newAttrRule.subLabelIndex),
                        initialInstances: parseInt(newAttrRule.initialInstances),
                        finalInstances:   parseInt(newAttrRule.finalInstances),
                        changePerTick:    parseFloat(newAttrRule.changePerTick),
                        tStart:           attrCalc?.sugTStart ?? parseInt(newAttrRule.tStart),
                        tEnd:             attrCalc?.sugTEnd   ?? parseInt(newAttrRule.tEnd),
                      };
                      setLocalAttrRules(prev => [
                        ...prev.filter(existing =>
                          existing.subLabelIndex !== parseInt(newAttrRule.subLabelIndex) ||
                          r.tStart >= existing.tEnd || r.tEnd <= existing.tStart
                        ),
                        r
                      ]);
                      setNewAttrRule(EMPTY_ATTR_RULE);
                      setOverlapConfirm(false);
                      setAttrRuleError('');
                    }}
                    style={{flex:1,padding:"5px",borderRadius:6,border:"none",
                      background:"rgba(239,68,68,0.2)",color:"#fca5a5",
                      fontSize:9,cursor:"pointer",fontFamily:"monospace"}}>
                    Replace old
                  </button>
                  <button
                    onClick={()=>setOverlapConfirm(false)}
                    style={{flex:1,padding:"5px",borderRadius:6,
                      border:`1px solid ${theme.border}`,background:"transparent",
                      color:theme.textDim,fontSize:9,cursor:"pointer",fontFamily:"monospace"}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Normal overlap warning when not yet confirmed */}
            {attrCalc?.hasOverlap && !overlapConfirm && (
              <div style={{fontSize:9,color:"#fbbf24",fontFamily:"monospace",marginBottom:6,lineHeight:1.5}}>
                ⚠ class_{ti}_{newAttrRule.subLabelIndex} already has a rule in this interval.
              </div>
            )}

            {attrRuleError && (
              <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:6,lineHeight:1.5}}>
                ⚠ {attrRuleError}
              </div>
            )}

            <button onClick={addAttrRule}
              style={{width:"100%",padding:"6px",borderRadius:6,border:"none",
                background:"rgba(96,165,250,0.15)",color:"#93c5fd",
                fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
              + Add attribution rule
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={onClose}
            style={{flex:1,padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,
              background:"transparent",color:theme.textDim,cursor:"pointer",
              fontSize:11,fontFamily:"monospace"}}>
            Cancel
          </button>
          <button onClick={()=>onSave(localCfg, localRules, localAttrRules)}
            style={{flex:1,padding:"7px",borderRadius:7,border:"none",
              background:"rgba(34,197,94,0.2)",color:"#4ade80",
              cursor:"pointer",fontSize:11,fontFamily:"monospace",fontWeight:700}}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}