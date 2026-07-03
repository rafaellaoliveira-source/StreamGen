import { useState, useEffect } from "react";
import { HelpIcon } from "./Tooltip.jsx";

export default function NumInput({ l, v, set, min=0, max=99999, integer=false, u="", disabled=false, theme={}, help="" }) {
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:10,color:theme.textDim??"#64748b",fontFamily:"monospace",
            textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
          {help && <HelpIcon text={help} theme={theme}/>}
        </div>
        {u && <span style={{fontSize:10,color:theme.textFaint??"#525f71",fontFamily:"monospace"}}>{u}</span>}
      </div>
      <input
        type="number" value={localVal} min={min} max={max} step={integer?1:"any"}
        disabled={disabled}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if(e.key === 'Enter') commit(e.target.value); }}
        style={{width:"100%",background:theme.inputBg??"#0d1a2e",
          border:`1px solid ${theme.cardBorder??"#0f1f35"}`,
          color:disabled?(theme.textFaint??"#525f71"):(theme.textMuted??"#94a3b8"),
          borderRadius:6,padding:"5px 8px",fontSize:12,fontFamily:"monospace",
          boxSizing:"border-box",opacity:disabled?0.5:1,
          cursor:disabled?"not-allowed":"text"}}/>
    </div>
  );
}