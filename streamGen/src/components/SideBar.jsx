export default function SliderInput({ l, min, max, step, v, set, decimals=2, u="", theme }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,color:theme.textDim,fontFamily:"monospace",
          textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</span>
        <span style={{fontSize:10,color:theme.textMuted,fontFamily:"monospace"}}>
          {Number(v).toFixed(decimals)}{u}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e=>set(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:"#3b82f6"}}/>
    </div>
  );
}