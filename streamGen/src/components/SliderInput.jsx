import { HelpIcon } from "./Tooltip.jsx";

export default function SliderInput({ l, min, max, step, v, set, decimals=2, u="", theme={}, help="" }) {
  const t = theme ?? {};
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:10,color:t.textDim??"#64748b",fontFamily:"monospace",
            textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
          {help && <HelpIcon text={help} theme={t}/>}
        </div>
        <span style={{fontSize:10,color:t.textMuted??"#94a3b8",fontFamily:"monospace"}}>
          {Number(v).toFixed(decimals)}{u}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:"#3b82f6",cursor:"pointer"}}/>
    </div>
  );
}