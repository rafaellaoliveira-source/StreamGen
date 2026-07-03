// ─── components/FeatureConfigModal.jsx ───────────────────────────────────────
import { HelpIcon } from "./Tooltip.jsx";

export default function FeatureConfigModal({ fi, trajs, transforms, onChange, onClose, theme }) {
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
          const t = transforms[fi]?.[ti] ?? {factor:1, offsetX:0, offsetY:0};
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
                    fontFamily:"monospace",marginBottom:4}}>
                    Factor{" "}
                    <HelpIcon
                      text="Scales the distance of this feature from the centroid. factor > 1 = farther, factor < 1 = closer, factor < 0 = opposite side."
                      theme={theme}
                    />
                  </div>
                  <input type="number" value={t.factor} step={0.1} min={-3} max={3}
                    onChange={e=>{
                      const v = parseFloat(e.target.value) || 1;
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
                    fontFamily:"monospace",marginBottom:4}}>
                    Offset X{" "}
                    <HelpIcon
                      text="Shifts the feature position horizontally. Positive = right, Negative = left."
                      theme={theme}
                    />
                  </div>
                  <input type="number" value={t.offsetX ?? 0} step={0.05}
                    onChange={e=>{
                      const v = parseFloat(e.target.value) || 0;
                      onChange(fi, ti, "offsetX", v);
                    }}
                    style={{width:"100%",background:theme.inputBg,
                      border:`1px solid ${theme.cardBorder}`,
                      color:theme.textMuted,borderRadius:5,
                      padding:"4px 6px",fontSize:11,fontFamily:"monospace",
                      boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:theme.textFaint,
                    fontFamily:"monospace",marginBottom:4}}>
                    Offset Y{" "}
                    <HelpIcon
                      text="Shifts the feature position vertically. Positive = up, Negative = down."
                      theme={theme}
                    />
                  </div>
                  <input type="number" value={t.offsetY ?? 0} step={0.05}
                    onChange={e=>{
                      const v = parseFloat(e.target.value) || 0;
                      onChange(fi, ti, "offsetY", v);
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
                f{fi+3} position = Moore({t.factor}×) + ({t.offsetX ?? 0}, {t.offsetY ?? 0})
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