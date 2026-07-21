// ─── components/LabelSpaceModal.jsx ──────────────────────────────────────────
import { useState, useMemo } from "react";
import { HelpIcon } from "./Tooltip.jsx";
import { selectActiveIndices } from "../utils/labelSpaceUtils.js";
import { inferAttributionDriftType, validateAttributionRule, calcChangePerTick, calcTransitionDuration } from "../utils/attributionUtils.js";

const STRATEGIES = [["first","First"],["last","Last"],["both","Both"],["random","Random"]];
const TABS = ["Base Config", "Frequency Rules", "Attribution"];

const EMPTY_ATTR_RULE = { subLabelIndex: 1, tStart: '', tEnd: '', instances: '', changePerTick: '' };

export default function LabelSpaceModal({
  ti, traj, theme,
  globalSubLabels, globalActive, globalStrategy,
  pts, startTime, endTime,
  onSave, onClose
}) {
  // ── States ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);

  const [localCfg, setLocalCfg] = useState(() => traj.labelConfig ?? {
    subLabels: globalSubLabels, activeLabels: globalSubLabels,
    strategy: globalStrategy, overlapMode: "full", overlapPartialN: 1,
  });

  const [localRules, setLocalRules]         = useState(() => traj.labelSpaceRules ?? []);
  const [newRule, setNewRule]               = useState({tStart:'', tEnd:'', activeLabels:'', strategy:'first'});
  const [ruleError, setRuleError]           = useState('');

  const [localAttrRules, setLocalAttrRules] = useState(() => traj.attributionRules ?? []);
  const [newAttrRule, setNewAttrRule]       = useState(EMPTY_ATTR_RULE);
  const [attrRuleError, setAttrRuleError]   = useState('');
  const [applyTo, setApplyTo]               = useState("single");
  const [rangeFrom, setRangeFrom]           = useState(1);
  const [rangeTo, setRangeTo]               = useState(1);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const validIntervals  = traj.segments.map(s => ({tStart: s.tStart, tEnd: s.tEnd}));
  const streamDuration  = endTime - startTime;
  const subLabelOptions = Array.from({length: localCfg.subLabels}, (_, i) => i + 1);

  // ── Shared styles ────────────────────────────────────────────────────────────
  const inp = { width:"100%", background:theme.inputBg, border:`1px solid ${theme.cardBorder}`,
    color:theme.textMuted, borderRadius:5, padding:"4px 6px", fontSize:11,
    fontFamily:"monospace", boxSizing:"border-box" };
  const lbl = { fontSize:9, color:theme.textFaint, fontFamily:"monospace", marginBottom:3 };

  const StrategyPicker = ({value, onChange, rgb="96,103,114"}) => (
    <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,
      border:`1px solid ${theme.border}`,marginBottom:8}}>
      {STRATEGIES.map(([s,l])=>(
        <button key={s} onClick={()=>onChange(s)}
          style={{flex:1,padding:"4px",borderRadius:6,border:"none",fontSize:9,cursor:"pointer",
            fontFamily:"monospace",transition:"all 0.15s",
            background:value===s?`rgba(${rgb},0.12)`:"transparent",
            color:value===s?`rgb(${rgb})`:theme.textDim,
            fontWeight:value===s?700:400}}>
          {l}
        </button>
      ))}
    </div>
  );

  // ── Active sub-labels in attribution rule interval ───────────────────────────
  const activeSubLabelsInInterval = useMemo(() => {
    const tS = parseInt(newAttrRule.tStart) || null;
    const tE = parseInt(newAttrRule.tEnd)   || null;
    const rule = (tS&&tE) ? localRules.find(r=>tS>=r.tStart&&tE<=r.tEnd) : null;
    const nActive  = rule?.activeLabels ?? localCfg.activeLabels;
    const strategy = rule?.strategy     ?? localCfg.strategy;
    return selectActiveIndices(localCfg.subLabels, nActive, strategy).map(i=>i+1);
  }, [newAttrRule.tStart, newAttrRule.tEnd, localRules, localCfg]);

  // ── Live attribution calc ────────────────────────────────────────────────────
  const attrCalc = useMemo(() => {
    const instances   = parseInt(newAttrRule.instances);
    const tStart      = parseInt(newAttrRule.tStart);
    const tEnd        = parseInt(newAttrRule.tEnd);
    const changePerTick = parseFloat(newAttrRule.changePerTick);
    if(isNaN(instances)) return null;

    const hasRange    = !isNaN(tStart) && !isNaN(tEnd) && tEnd > tStart;
    const hasChange   = !isNaN(changePerTick) && changePerTick !== 0;
    const duration    = hasRange ? tEnd - tStart : null;

    // Drift type
    const driftType = hasChange
      ? inferAttributionDriftType(changePerTick, streamDuration)
      : { type: "Fixed", color: "#94a3b8" };

    // Suggestions
    let suggestedIncrease = null;
    let suggestedDecrease = null;
    if(hasRange && !hasChange){
      suggestedIncrease = calcChangePerTick(instances, pts, duration, "increase");
      suggestedDecrease = calcChangePerTick(instances, pts, duration, "decrease");
    }

    // Duration estimate if change is set
    let estimatedDuration = null;
    if(hasChange){
      estimatedDuration = calcTransitionDuration(instances, changePerTick, pts);
    }

    // Overlap check
    const tS = isNaN(tStart) ? null : tStart;
    const tE = isNaN(tEnd)   ? null : tEnd;
    const hasOverlap = tS!=null && tE!=null &&
      localAttrRules.some(r =>
        r.subLabelIndex === parseInt(newAttrRule.subLabelIndex) &&
        tS < r.tEnd && tE > r.tStart
      );

    // Pattern detection
    const patterns = [];
    if(hasChange){
      const newDir = Math.sign(changePerTick);
      localAttrRules.forEach(existing => {
        if(!existing.changePerTick) return;
        if(existing.subLabelIndex === parseInt(newAttrRule.subLabelIndex)) return;
        const existDir = Math.sign(existing.changePerTick);
        if(existDir === -newDir)
          patterns.push({color:'#4ade80', msg:`〰 Gradual · mirrors class_${ti}_${existing.subLabelIndex}`});
        else
          patterns.push({color:'#60a5fa', msg:`↗ Incremental · same direction as class_${ti}_${existing.subLabelIndex}`});
      });
    }

    return { driftType, duration, estimatedDuration, suggestedIncrease, suggestedDecrease, hasOverlap, patterns };
  }, [newAttrRule, localAttrRules, streamDuration, pts]);

  // ── Frequency Rule helpers ───────────────────────────────────────────────────
  const isValidFreqRule = (r) =>
    validIntervals.some(iv=>r.tStart>=iv.tStart&&r.tEnd<=iv.tEnd) &&
    r.tStart < r.tEnd && r.activeLabels>=1 && r.activeLabels<=localCfg.subLabels;

  const addFreqRule = () => {
    const r = {
      tStart:       parseInt(newRule.tStart),
      tEnd:         parseInt(newRule.tEnd),
      activeLabels: parseInt(newRule.activeLabels),
      strategy:     newRule.strategy,
    };
    if(isNaN(r.tStart)||isNaN(r.tEnd)||isNaN(r.activeLabels)){ setRuleError('All fields are required.'); return; }
    if(!isValidFreqRule(r)){
      setRuleError(`Active labels must be ≥1 and ≤${localCfg.subLabels}. Range must be within: ${validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}`);
      return;
    }
    setRuleError('');
    setLocalRules(prev=>[...prev,r]);
    setNewRule({tStart:'',tEnd:'',activeLabels:'',strategy:'first'});
  };

  // ── Attribution Rule helpers ─────────────────────────────────────────────────
  const addAttrRule = () => {
    const r = {
      subLabelIndex: parseInt(newAttrRule.subLabelIndex),
      tStart:        parseInt(newAttrRule.tStart),
      tEnd:          parseInt(newAttrRule.tEnd),
      instances:     parseInt(newAttrRule.instances),
      changePerTick: (newAttrRule.changePerTick !== '' && newAttrRule.changePerTick !== '0' && !isNaN(parseFloat(newAttrRule.changePerTick))) ? parseFloat(newAttrRule.changePerTick) : null,
    };
    if(isNaN(r.subLabelIndex)||isNaN(r.tStart)||isNaN(r.tEnd)||isNaN(r.instances)){
      setAttrRuleError('Sub-label, t start, t end and instances are required.'); return;
    }
    const warnings = validateAttributionRule(r, pts, validIntervals);
    if(warnings.length>0){ setAttrRuleError(warnings[0]); return; }

    const indicesToApply = (() => {
      switch(applyTo){
        case "all":   return Array.from({length:localCfg.subLabels},(_,i)=>i+1);
        case "range": return Array.from({length:Math.max(0,rangeTo-rangeFrom+1)},(_,i)=>rangeFrom+i).filter(i=>i>=1&&i<=localCfg.subLabels);
        default:      return [r.subLabelIndex];
      }
    })();
    if(indicesToApply.length===0){ setAttrRuleError('Invalid range.'); return; }
    const inactive = indicesToApply.filter(i=>!activeSubLabelsInInterval.includes(i));
    if(inactive.length>0){ setAttrRuleError(`Inactive in this interval: ${inactive.map(i=>`class_${ti}_${i}`).join(', ')}`); return; }
    

    setAttrRuleError('');
    setLocalAttrRules(prev=>[...prev,...indicesToApply.map(idx=>({...r,subLabelIndex:idx}))]);
    setNewAttrRule(EMPTY_ATTR_RULE);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(6px)",display:"flex",alignItems:"center",
      justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:theme.sidebar,border:`1px solid ${theme.border}`,
        borderRadius:14,padding:24,maxWidth:500,width:"95%",maxHeight:"92vh",
        display:"flex",flexDirection:"column"}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexShrink:0}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:traj.color,flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:700,color:theme.text}}>C{ti} — Label Space</span>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:0,marginBottom:16,flexShrink:0,
          borderBottom:`1px solid ${theme.border}`}}>
          {TABS.map((tab,i)=>{
            const hasContent = i===1 ? localRules.length>0 : i===2 ? localAttrRules.length>0 : false;
            const isActive = activeTab===i;
            return (
              <button key={tab} onClick={()=>setActiveTab(i)}
                style={{
                  padding:"6px 14px",
                  border:"none",
                  borderBottom: isActive ? `2px solid #1e293b` : "2px solid transparent",
                  marginBottom:"-1px",
                  background:"transparent",
                  color: isActive ? "#575d68" : theme.textDim,
                  fontSize:10,
                  cursor:"pointer",
                  fontFamily:"monospace",
                  fontWeight: isActive ? 700 : 400,
                  transition:"all 0.15s",
                }}>
                {tab}{hasContent?` (${i===1?localRules.length:localAttrRules.length})`:""}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{overflowY:"auto",flex:1}}>

          {/* ── Tab 0: Base Config ── */}
          {activeTab===0 && (
            <div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{...lbl,display:"flex",alignItems:"center",gap:4}}>
                    Total sub-labels <HelpIcon text="Total binary columns for this cluster: class_ti_1, class_ti_2, ..." theme={theme}/>
                  </div>
                  <input type="number" value={localCfg.subLabels} min={1} max={200} style={inp}
                    onChange={e=>{ const v=Math.max(1,parseInt(e.target.value)||1); setLocalCfg(p=>({...p,subLabels:v,activeLabels:Math.min(p.activeLabels,v)})); }}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{...lbl,display:"flex",alignItems:"center",gap:4}}>
                    Active per instance <HelpIcon text="How many sub-labels are set to 1 per instance. The rest remain 0." theme={theme}/>
                  </div>
                  <input type="number" value={localCfg.activeLabels} min={1} max={localCfg.subLabels} style={inp}
                    onChange={e=>{ const v=Math.max(1,Math.min(localCfg.subLabels,parseInt(e.target.value)||1)); setLocalCfg(p=>({...p,activeLabels:v})); }}/>
                </div>
              </div>

              <div style={{...lbl,display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                Strategy <HelpIcon text={"Which sub-labels are active:\n• First — lowest indices\n• Last — highest indices\n• Both — extremes only\n• Random — random N per instance"} theme={theme}/>
              </div>
              <StrategyPicker value={localCfg.strategy} onChange={s=>setLocalCfg(p=>({...p,strategy:s}))}/>

              <div style={{fontSize:9,color:"#a0a7b3",fontFamily:"monospace",marginBottom:14}}>
                {localCfg.activeLabels} of {localCfg.subLabels} active · columns: class_{ti}_1 … class_{ti}_{localCfg.subLabels}
              </div>

              {/* Overlap Behavior */}
              <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:12}}>
                <div style={{...lbl,display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                  Overlap behavior <HelpIcon text={"When an instance falls within another cluster's radius:\n• Full — receives all active sub-labels from neighbor\n• Origin — only sub-labels from this cluster\n• Partial — first N active sub-labels from neighbor"} theme={theme}/>
                </div>
                <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,
                  border:`1px solid ${theme.border}`,marginBottom:6}}>
                  {[["full","Full"],["origin","Origin"],["partial","Partial"]].map(([mode,l])=>(
                    <button key={mode} onClick={()=>setLocalCfg(p=>({...p,overlapMode:mode}))}
                      style={{flex:1,padding:"5px 4px",borderRadius:6,border:"none",fontSize:9,
                        cursor:"pointer",fontFamily:"monospace",transition:"all 0.15s",
                        background:localCfg.overlapMode===mode?"#cbd3dd6c":"transparent",
                        color:localCfg.overlapMode===mode?"#606772":theme.textDim,
                        fontWeight:localCfg.overlapMode===mode?700:400}}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8,lineHeight:1.5}}>
                  {localCfg.overlapMode==="full"    && "→ Instances in overlap receive all active sub-labels from neighbor"}
                  {localCfg.overlapMode==="origin"  && "→ Instances in overlap receive only sub-labels from this cluster"}
                  {localCfg.overlapMode==="partial" && "→ Instances in overlap receive first N active sub-labels from neighbor"}
                </div>
                {localCfg.overlapMode==="partial" && (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace"}}>Sub-labels from neighbor:</span>
                    <input type="number" value={localCfg.overlapPartialN??1} min={1} max={localCfg.activeLabels}
                      onChange={e=>{ const v=Math.max(1,Math.min(localCfg.activeLabels,parseInt(e.target.value)||1)); setLocalCfg(p=>({...p,overlapPartialN:v})); }}
                      style={{...inp,width:60}}/>
                    <span style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace"}}>of {localCfg.activeLabels} active</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab 1: Frequency Rules ── */}
          {activeTab===1 && (
            <div>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:10}}>
                Temporarily change how many sub-labels are active during a specific interval.
                Valid intervals: {validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}
              </div>

              {localRules.length===0
                ? <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:12}}>No rules — using base config.</div>
                : <>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
                  <button onClick={()=>setLocalRules([])}
                    style={{background:"transparent",border:"none",color:"#f87171",
                      cursor:"pointer",fontSize:9,fontFamily:"monospace",padding:0}}>
                    ✕ clear all
                  </button>
                </div>
                {localRules.map((r,ri)=>(
                  <div key={ri} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
                    padding:"5px 9px",borderRadius:6,border:`1px solid ${theme.cardBorder}`,background:theme.cardBg}}>
                    <span style={{fontSize:10,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
                      t={r.tStart}→{r.tEnd} · active={r.activeLabels} · {r.strategy}
                    </span>
                    <button onClick={()=>setLocalRules(p=>p.filter((_,i)=>i!==ri))}
                      style={{background:"transparent",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                  </div>
                ))}
                </>
              }

              <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:12,marginTop:8}}>
                <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8}}>Add rule</div>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  {[["start","tStart"],["end","tEnd"],["active","activeLabels"]].map(([l,k])=>(
                    <div key={k} style={{flex:1}}>
                      <div style={lbl}>{l}</div>
                      <input type="number" value={newRule[k]} style={inp}
                        onChange={e=>setNewRule(p=>({...p,[k]:e.target.value}))}/>
                    </div>
                  ))}
                </div>
                <StrategyPicker value={newRule.strategy} onChange={s=>setNewRule(p=>({...p,strategy:s}))}/>
                {ruleError && <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:6}}>⚠ {ruleError}</div>}
                <button onClick={addFreqRule}
                  style={{width:"100%",padding:"6px",borderRadius:6,border:"none",
                    background:"#60a5fa26",color:"#93c5fd",fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
                  + Add frequency rule
                </button>
              </div>
            </div>
          )}

          {/* ── Tab 2: Attribution ── */}
          {activeTab===2 && (
            <div>
              <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:10,lineHeight:1.6}}>
                Control how many instances per tick receive each sub-label.
                By default all instances receive all active sub-labels.
                Valid intervals: {validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}
              </div>

              {localAttrRules.length===0
                ? <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:12}}>No rules — using default (all instances).</div>
                : <>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
                    <button onClick={()=>setLocalAttrRules([])}
                      style={{background:"transparent",border:"none",color:"#f87171",
                        cursor:"pointer",fontSize:9,fontFamily:"monospace",padding:0}}>
                      ✕ clear all
                    </button>
                  </div>
                
                {localAttrRules.map((r,ri)=>(
                  <div key={ri} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
                    padding:"5px 9px",borderRadius:6,border:`1px solid ${theme.cardBorder}`,background:theme.cardBg}}>
                    <span style={{fontSize:10,fontFamily:"monospace",color:theme.textMuted,flex:1}}>
                      class_{ti}_{r.subLabelIndex} · t={r.tStart}→{r.tEnd} · {r.instances} inst
                      {r.changePerTick ? ` · ${r.changePerTick>0?"+":""}${r.changePerTick}/tick` : " · fixed"}
                    </span>
                    <button onClick={()=>setLocalAttrRules(p=>p.filter((_,i)=>i!==ri))}
                      style={{background:"transparent",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                  </div>
                ))} </>
              }

              {/* Add form */}
              <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:12,marginTop:8}}>
                <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:8}}>Add rule</div>

                {/* Apply to */}
                <div style={{marginBottom:8}}>
                  <div style={{...lbl,display:"flex",alignItems:"center",gap:4}}>
                    Apply to <HelpIcon text={"Select label — one specific sub-label\nRange — a range of sub-labels\nAll — all sub-labels at once"} theme={theme}/>
                  </div>
                  <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,padding:3,border:`1px solid ${theme.border}`}}>
                    {[["single","Select"],["range","Range"],["all","All"]].map(([mode,l])=>(
                      <button key={mode} onClick={()=>setApplyTo(mode)}
                        style={{flex:1,padding:"4px",borderRadius:6,border:"none",fontSize:9,cursor:"pointer",
                          fontFamily:"monospace",transition:"all 0.15s",
                          background:applyTo===mode?"rgba(96, 103, 114, 0.12)":"transparent",
                          color:applyTo===mode?"#606772":theme.textDim,
                          fontWeight:applyTo===mode?700:400}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub-label selector */}
                {applyTo==="single" && (
                  <div style={{marginBottom:8}}>
                    <div style={lbl}>Sub-label</div>
                    <select value={newAttrRule.subLabelIndex} style={inp}
                      onChange={e=>setNewAttrRule(p=>({...p,subLabelIndex:parseInt(e.target.value)}))}>
                      {subLabelOptions.filter(i=>activeSubLabelsInInterval.includes(i)).map(i=>(
                        <option key={i} value={i}>class_{ti}_{i}</option>
                      ))}
                    </select>
                    {activeSubLabelsInInterval.length<localCfg.subLabels && (
                      <div style={{fontSize:9,color:"#fbbf24",fontFamily:"monospace",marginTop:3}}>
                        ⚠ {localCfg.subLabels-activeSubLabelsInInterval.length} sub-label(s) inactive in this interval
                      </div>
                    )}
                  </div>
                )}

                {applyTo==="range" && (
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={lbl}>From</div>
                      <select value={rangeFrom} style={inp} onChange={e=>setRangeFrom(parseInt(e.target.value))}>
                        {subLabelOptions.filter(i=>activeSubLabelsInInterval.includes(i)).map(i=>(
                          <option key={i} value={i}>class_{ti}_{i}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <div style={lbl}>To</div>
                      <select value={rangeTo} style={inp} onChange={e=>setRangeTo(parseInt(e.target.value))}>
                        {subLabelOptions.filter(i=>activeSubLabelsInInterval.includes(i)&&i>=rangeFrom).map(i=>(
                          <option key={i} value={i}>class_{ti}_{i}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                      <span style={{fontSize:9,color:"#93c5fd",fontFamily:"monospace"}}>
                        {activeSubLabelsInInterval.filter(i=>i>=rangeFrom&&i<=rangeTo).length} labels
                      </span>
                    </div>
                  </div>
                )}

                {applyTo==="all" && (
                  <div style={{fontSize:9,color:"#93c5fd",fontFamily:"monospace",marginBottom:8}}>
                    Applies to all {localCfg.subLabels} sub-labels
                  </div>
                )}

                {/* tStart, tEnd, instances */}
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {[
                    ["start","tStart",null],
                    ["end","tEnd",null],
                    ["inst per tick","instances",null],
                  ].map(([l,k,help])=>(
                    <div key={k} style={{flex:1}}>
                      <div style={{...lbl,display:"flex",alignItems:"center",gap:3}}>
                        {l} {help && <HelpIcon text={help} theme={theme}/>}
                      </div>
                      <input type="number" value={newAttrRule[k]} min={0} style={inp}
                        onChange={e=>setNewAttrRule(p=>({...p,[k]:e.target.value}))}/>
                    </div>
                  ))}
                </div>

                {/* Change/tick — optional */}
                <div style={{marginBottom:8}}>
                  <div style={{...lbl,display:"flex",alignItems:"center",gap:4}}>
                    Change/tick (optional — gradual transition)
                    <HelpIcon text={"Leave empty for a fixed value throughout the interval.\n\nIf set, the instance count changes by this amount each tick:\n• Positive → increases over time\n• Negative → decreases over time\n\nExample: instances=5, change=+2 → t+1: 7 inst, t+2: 9 inst..."} theme={theme}/>
                  </div>
                  <input type="number" value={newAttrRule.changePerTick} style={inp}
                    onChange={e=>setNewAttrRule(p=>({...p,changePerTick:e.target.value}))}/>
                </div>

                {/* Live feedback */}
                {attrCalc && (
                  <div style={{marginBottom:8,padding:"6px 9px",borderRadius:6,
                    background:theme.cardBg,border:`1px solid ${theme.cardBorder}`}}>
                    <div style={{fontSize:9,fontFamily:"monospace",color:attrCalc.driftType.color,marginBottom:2}}>
                      {attrCalc.driftType.type==="Fixed"?"◼":attrCalc.driftType.type==="Abrupt"?"⚡":attrCalc.driftType.type==="Incremental"?"↗":"⚠"}{" "}
                      {attrCalc.driftType.type}
                      {attrCalc.estimatedDuration!=null&&attrCalc.estimatedDuration!==Infinity&&
                        ` · reaches limit in ~${attrCalc.estimatedDuration} ticks`}
                    </div>
                    {attrCalc.patterns?.map((p,pi)=>(
                      <div key={pi} style={{fontSize:9,fontFamily:"monospace",color:p.color,marginTop:2}}>{p.msg}</div>
                    ))}
                    {(attrCalc.suggestedIncrease!=null||attrCalc.suggestedDecrease!=null)&&(
                      <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginTop:4,lineHeight:1.6}}>
                        To reach max in {attrCalc.duration} ticks:
                        {attrCalc.suggestedIncrease!=null&&(
                          <span> +{attrCalc.suggestedIncrease}/tick
                            <button onClick={()=>setNewAttrRule(p=>({...p,changePerTick:String(attrCalc.suggestedIncrease)}))}
                              style={{marginLeft:6,background:"transparent",border:`1px solid ${theme.cardBorder}`,
                                borderRadius:4,color:"#93c5fd",cursor:"pointer",fontSize:9,padding:"1px 5px",fontFamily:"monospace"}}>use</button>
                          </span>
                        )}
                        {attrCalc.suggestedIncrease!=null&&attrCalc.suggestedDecrease!=null&&" · "}
                        {attrCalc.suggestedDecrease!=null&&(
                          <span> -{attrCalc.suggestedDecrease}/tick
                            <button onClick={()=>setNewAttrRule(p=>({...p,changePerTick:String(-attrCalc.suggestedDecrease)}))}
                              style={{marginLeft:6,background:"transparent",border:`1px solid ${theme.cardBorder}`,
                                borderRadius:4,color:"#93c5fd",cursor:"pointer",fontSize:9,padding:"1px 5px",fontFamily:"monospace"}}>use</button>
                          </span>
                        )}
                      </div>
                    )}
                    {attrCalc.hasOverlap&&(
                      <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginTop:4}}>
                        ⚠ class_{ti}_{newAttrRule.subLabelIndex} already has a rule in this interval.
                      </div>
                    )}
                  </div>
                )}

                {attrRuleError&&(
                  <div style={{fontSize:9,color:"#f87171",fontFamily:"monospace",marginBottom:6}}>⚠ {attrRuleError}</div>
                )}

                <button onClick={addAttrRule}
                  style={{width:"100%",padding:"6px",borderRadius:6,border:"none",
                    background:"rgba(96,165,250,0.15)",color:"#93c5fd",fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
                  + Add attribution rule
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{display:"flex",gap:8,marginTop:16,flexShrink:0,paddingTop:12,borderTop:`1px solid ${theme.border}`}}>
          <button onClick={onClose}
            style={{flex:1,padding:"7px",borderRadius:7,border:`1px solid ${theme.border}`,
              background:"transparent",color:theme.textDim,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>
            Cancel
          </button>
          <button onClick={()=>onSave(localCfg,localRules,localAttrRules)}
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