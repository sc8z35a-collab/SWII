// Small vector helpers shared by the world builder, the server and the renderers.
export const rad=Math.PI/180;
export const vectorCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const normalize=a=>a.map(v=>v/(Math.hypot(...a)||1));
