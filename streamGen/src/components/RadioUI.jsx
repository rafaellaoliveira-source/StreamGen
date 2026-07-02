export default function RadioUI({ label, opts, val, set, theme }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:9,color:theme.textFaint,fontFamily:"monospace",
        textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{label}</div>
      <div style={{display:"flex",gap:3,background:theme.bg,borderRadius:8,
        padding:3,border:`1px solid ${theme.border}`}}>
        {opts.map(o=>(
          <button key={o} onClick={()=>set(o)} style={{
            flex:1,padding:"5px 4px",borderRadius:6,border:"none",
            fontSize:10,cursor:"pointer",fontFamily:"monospace",
            fontWeight:o===val?700:400,
            background:o===val?"rgba(59,130,246,0.15)":"transparent",
            color:o===val?"#93c5fd":theme.textDim,
            transition:"all 0.15s"
          }}>{o}</button>
        ))}
      </div>
    </div>
  );
}