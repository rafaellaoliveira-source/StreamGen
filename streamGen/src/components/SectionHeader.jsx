export default function SectionHeader({ skey, label, badge, openSections, onToggle, theme }) {
  return (
    <div
      onClick={() => onToggle(skey)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        paddingBottom: 8,
        marginBottom: openSections[skey] ? 6 : 0,
        borderBottom: openSections[skey] ? `1px solid ${theme.border}` : "none",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 9,
            color: theme.textFaint,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {label}
        </span>
        {badge && (
          <span style={{ fontSize: 9, color: "#f5a623", fontFamily: "monospace" }}>
            {badge}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 9,
          color: theme.textFaint,
          display: "inline-block",
          transition: "transform 0.2s",
          transform: openSections[skey] ? "rotate(0deg)" : "rotate(-90deg)",
        }}
      >
        ▾
      </span>
    </div>
  );
}