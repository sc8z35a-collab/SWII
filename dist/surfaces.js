export const LAND=26,ASPHALT=27,PAVING=28;
export const isSurface=mat=>mat>=LAND&&mat<=PAVING;
const byte=n=>Math.min(255,Math.max(0,Math.round(n)));
export function packSlope(nx,nz){
  return byte(nx*127+128)|(byte(nz*127+128)<<8);
}
export function unpackSlope(packed){
  const x=((packed&255)-128)/127,z=((packed>>>8)-128)/127;
  return [x,Math.sqrt(Math.max(0,1-x*x-z*z)),z];
}
export function packColor([r,g,b]){
  return (Math.round(r*31)<<11)|(Math.round(g*63)<<5)|Math.round(b*31);
}
export function unpackColor(packed){
  return [(packed>>>11)/31,((packed>>>5)&63)/63,(packed&31)/31];
}
export function surfaceTriangle(out,a,b,c,slopes,colors,material){
  // Triangle instances have no vertical basis. That slot and the RGB slot carry one value per corner.
  out.push(...a,b[0]-a[0],b[1]-a[1],b[2]-a[2],...slopes,c[0]-a[0],c[1]-a[1],c[2]-a[2],...colors,material);
}
