export function boxMuller() {
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

export function gaussianPoints(cx,cy,std,n) {
  return Array.from({length:n},()=>({
    x:Math.max(-1,Math.min(1,cx+boxMuller()*std)),
    y:Math.max(-1,Math.min(1,cy+boxMuller()*std))
  }));
}

export function rbfPoints(cx,cy,s,n) {
  return Array.from({length:n},()=>{
    const r=Math.random()*s*2, t=Math.random()*2*Math.PI;
    return {
      x:Math.max(-1,Math.min(1,cx+r*Math.cos(t))),
      y:Math.max(-1,Math.min(1,cy+r*Math.sin(t)))
    };
  });
}