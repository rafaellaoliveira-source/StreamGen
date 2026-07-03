// ─── components/DensityModal.jsx ─────────────────────────────────────────────
import { useState } from "react";
import { HelpIcon } from "./Tooltip.jsx";

export default function DensityModal({
  traj, trajIdx, defaultPts, theme,
  rules, onAddRule, onRemoveRule, onClose, onSave
}) {
  const validIntervals = traj.segments.map(s => ({tStart: s.tStart, tEnd: s.tEnd}));
  const [newRule, setNewRule] = useState({tStart:'', tEnd:'', pts:''});
  const [ruleError, setRuleError] = useState('');

  const isValidRule = (r) =>
    validIntervals.some(iv => r.tStart >= iv.tStart && r.tEnd <= iv.tEnd) &&
    r.tStart < r.tEnd && r.pts >= 1;

  const addRule = () => {
    const r = {
      tStart: parseInt(newRule.tStart),
      tEnd:   parseInt(newRule.tEnd),
      pts:    parseInt(newRule.pts)
    };
    if(isNaN(r.tStart) || isNaN(r.tEnd) || isNaN(r.pts)){
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
            Cluster {trajIdx} — Frequency Rules{" "}
            <HelpIcon
              text={"Controls how many instances are generated per timestamp for this cluster, within a specific time interval.\n\nOverrides the global Instances per Centroid value for the selected range."}
              theme={theme}
            />
          </span>
        </div>

        <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",marginBottom:12,lineHeight:1.6}}>
          Global default: {defaultPts} inst/tick<br/>
          Valid intervals: {validIntervals.map(iv=>`t=${iv.tStart}→${iv.tEnd}`).join(', ')}
        </div>

        {rules.length === 0 && (
          <div style={{fontSize:10,color:theme.textFaint,fontFamily:"monospace",marginBottom:12}}>
            No rules — using global default.
          </div>
        )}

        {rules.map((r, ri) => (
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
          {ruleError && (
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
          <button onClick={onSave}
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