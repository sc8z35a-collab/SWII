import {GRID_STEP,rawHeight} from './geography.js';
import {roadTunnelPlans} from './transport-layout.js';

export const tunnelRoof=5.65;
export const TUNNEL_ASPHALT=37;
function meshHeight(x,z){
  const a=Math.floor(x/GRID_STEP)*GRID_STEP,b=Math.floor(z/GRID_STEP)*GRID_STEP;
  const u=(x-a)/GRID_STEP,v=(z-b)/GRID_STEP;
  const h=(x,z)=>Math.round(rawHeight(x,z)*100)*.01;
  const p=h(a,b),q=h(a+GRID_STEP,b),r=h(a,b+GRID_STEP),s=h(a+GRID_STEP,b+GRID_STEP);
  return u+v<=1?p+(q-p)*u+(r-p)*v:s+(r-s)*(1-u)+(q-s)*(1-v);
}
export const roadTunnels=roadTunnelPlans.map(plan=>{
  const {start,end,half}=plan,dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz);
  return {...plan,length,dx:dx/length,dz:dz/length,entryY:meshHeight(...start),exitY:meshHeight(...end),
    bounds:[Math.min(start[0],end[0])-half-2,Math.min(start[1],end[1])-half-2,
      Math.max(start[0],end[0])+half+2,Math.max(start[1],end[1])+half+2]};
});
export function tunnelPoint(t,distance,offset=0){
  return [t.start[0]+t.dx*distance-t.dz*offset,t.start[1]+t.dz*distance+t.dx*offset];
}
export function tunnelFloor(t,distance){
  const edge=distance<t.length*.5?t.entryY:t.exitY;
  const u=Math.max(0,Math.min(1,Math.min(distance,t.length-distance)/t.ramp));
  return edge+(t.depth-edge)*u*u*(3-2*u);
}
export function tunnelDistance(t,x,z){
  const a=x-t.start[0],b=z-t.start[1];
  return [a*t.dx+b*t.dz,-a*t.dz+b*t.dx];
}
export function tunnelSupport(x,z,level){
  for(const t of roadTunnels){
    const [w,n,e,s]=t.bounds;
    if(x<w||x>e||z<n||z>s)continue;
    const [along,offset]=tunnelDistance(t,x,z);
    if(along<0||along>t.length||Math.abs(offset)>t.half+.56)continue;
    const floor=tunnelFloor(t,along);
    if(Math.min(along,t.length-along)>=t.ramp&&(level===undefined||level>floor+3.4))continue;
    return Math.abs(offset)<t.half-.23?floor:null;
  }
}
export function tunnelCuts(x,z,size){
  return roadTunnels.flatMap(t=>[[0,t.ramp],[t.length-t.ramp,t.length]].map(([first,last])=>{
    const a=tunnelPoint(t,first,-t.half),b=tunnelPoint(t,last,t.half);
    return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
  }).filter(([w,n,e,s])=>e>x&&s>z&&w<x+size&&n<z+size));
}
