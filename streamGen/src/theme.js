// ─── Colors ───────────────────────────────────────────────────────────────────
export const CLUSTER_COLORS = [
  "#e05c5c","#4e9af1","#4ec994","#f5a623",
  "#b36fd6","#f06c9b","#00c9c9","#d4b44a"
];

export const FEATURE_COLORS = [
  "#f5a623","#a78bfa","#34d399","#f472b6",
  "#60a5fa","#fb923c","#a3e635","#e879f9",
  "#67e8f9","#fde68a"
];

export const randomColor  = (idx) => CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
export const featureColor = (fi)  => FEATURE_COLORS[fi  % FEATURE_COLORS.length];

// ─── Theme ────────────────────────────────────────────────────────────────────
export const makeTheme = (dark) => ({
  bg:        dark?"#f1f5f9":"#070b12",
  sidebar:   dark?"#ffffff":"#0a0f1e",
  border:    dark?"#e2e8f0":"#0d1a2e",
  cardBg:    dark?"#e2e8f0":"#0d1a2e",
  cardBorder:dark?"#e2e8f0":"#0f1f35",
  text:      dark?"#1e293b":"#e2e8f0",
  textMuted: dark?"#1c345a":"#94a3b8",
  textDim:   dark?"#1c345a":"#64748b",
  texGen:    dark?"#408cdf":"#64748b",
  bdGen:     dark?"#408cdf":"#64748b",
  btnBd:     dark?"#e2e8f0":"#64748b",
  textFaint: dark?"#8892a1":"#525f71",
  label:     dark?"#94a3b8":"#1e3a5f",
  axisX:     dark?"rgba(59,130,246,0.5)":"rgba(96,165,250,0.35)",
  axisY:     dark?"rgba(239,68,68,0.5)":"rgba(248,113,113,0.35)",
  grid:      dark?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.05)",
  canvasBg:  dark?"#f8fafc":"#080c14",
  inputBg:   dark?"#f1f5f9":"#0d1a2e",
  toolbarBg: dark?"#ffffff":"#0a0f1e",
});