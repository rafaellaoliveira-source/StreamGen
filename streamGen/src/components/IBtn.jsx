export default function IBtn({ onClick, title, children, accent=false, danger=false, theme }) {
  return (
    <button onClick={onClick} title={title} style={{
      width:32,height:32,borderRadius:7,
      border:`1px solid ${danger?"#7f1d1d":accent?"#1d4ed8":theme.border}`,
      background:danger?"rgba(127,29,29,0.2)":accent?"rgba(29,78,216,0.15)":"transparent",
      color:danger?"#f87171":accent?"#93c5fd":theme.textMuted,
      display:"flex",alignItems:"center",justifyContent:"center",
      cursor:"pointer",fontSize:16
    }}>{children}</button>
  );
}
