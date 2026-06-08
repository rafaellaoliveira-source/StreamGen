import { useState } from "react";

export function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({x:0, y:0});

  return (
    <span style={{position:"relative", display:"inline-flex"}}
      onMouseEnter={e=>{ setVisible(true); setPos({x:e.clientX, y:e.clientY}); }}
      onMouseMove={e=>setPos({x:e.clientX, y:e.clientY})}
      onMouseLeave={()=>setVisible(false)}>
      {children}
      {visible&&(
        <div style={{
          position:"fixed",
          left: pos.x + 14,
          top: pos.y - 8,
          background:"#1e293b",
          color:"#e2e8f0",
          fontSize:10,
          fontFamily:"monospace",
          padding:"6px 10px",
          borderRadius:6,
          border:"1px solid #334155",
          maxWidth:240,
          lineHeight:1.6,
          zIndex:9999,
          pointerEvents:"none",
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
          whiteSpace:"pre-wrap",
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

export function HelpIcon({ text, theme={} }) {
  return (
    <Tooltip text={text}>
      <span style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:13, height:13, borderRadius:"50%",
        border:`1px solid ${theme.border??"#334155"}`,
        color:theme.textFaint??"#525f71",
        fontSize:8, fontFamily:"monospace",
        cursor:"help", flexShrink:0,
        userSelect:"none", lineHeight:1,
      }}>?</span>
    </Tooltip>
  );
}