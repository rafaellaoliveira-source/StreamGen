export function downloadImage(canvasRef, filename) {
  const canvas = canvasRef.current;
  if(!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  const base = filename.endsWith(".csv") ? filename.replace(".csv","") : filename;
  a.href = url;
  a.download = base + ".png";
  a.click();
}
 