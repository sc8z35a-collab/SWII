import {metroStops} from './transport-layout.js';

export const trackY=-34;
export const platformY=trackY+1.1;
export const hallLength=112;
const straight=hallLength*.5+6,arrivalDelay=8400,dwell=40000,departureDelay=2000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const unit=(x,z)=>{const length=Math.hypot(x,z)||1;return [x/length,z/length];};
const shift=(point,[x,z],length)=>[point[0]+x*length,point[1]+z*length];
const nextIndex=i=>(i+1)%metroStops.length;
const previousIndex=i=>(i+metroStops.length-1)%metroStops.length;

export const stations=metroStops.map((station,i)=>{
  const previous=metroStops[previousIndex(i)],next=metroStops[nextIndex(i)];
  const a=unit(station.x-previous.x,station.z-previous.z),b=unit(next.x-station.x,next.z-station.z);
  return {...station,index:i,tangent:unit(a[0]+b[0],a[1]+b[1])};
});
export const stationById=new Map(stations.map(s=>[s.id,s]));
export const stationEntry=station=>[station.x+(station.id==='airport'?0:13),station.z];

export function stationPoint(station,along=0,side=0){
  const [dx,dz]=station.tangent;
  return [station.x+dx*along-dz*side,station.z+dz*along+dx*side];
}
export function stationSupport(id,x,z){
  const station=stationById.get(id);
  if(!station)return null;
  const a=x-station.x,b=z-station.z,[dx,dz]=station.tangent;
  const along=a*dx+b*dz,side=b*dx-a*dz;
  if(Math.abs(along)>=hallLength*.5-.45||side<=1.94||side>=7.74)return null;
  const post=Math.round(along/9)*9,bench=Math.round((along-.87)/18)*18+.87;
  if(side>6.34&&Math.abs(post)<=45&&Math.abs(along-post)<.61)return null;
  if(side>5.50&&side<7.30&&Math.abs(bench)<46&&Math.abs(along-bench)<1.80)return null;
  return platformY;
}
function makeLeg(from,to){
  const start=[from.x,from.z],end=[to.x,to.z];
  const p=shift(start,from.tangent,straight),q=shift(end,to.tangent,-straight);
  const span=Math.hypot(q[0]-p[0],q[1]-p[1]),a=shift(p,from.tangent,span*.29),b=shift(q,to.tangent,-span*.29);
  const points=[start,p],distances=[0,straight],samples=Math.ceil(span/17);
  for(let i=1;i<=samples;i++){
    const t=i/samples,v=1-t;
    points.push(p.map((n,k)=>v**3*n+3*v*v*t*a[k]+3*v*t*t*b[k]+t**3*q[k]));
  }
  points.push(end);
  for(let i=2;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const length=distances.at(-1),duration=Math.round((length/37+6)*1000);
  return {from,to,points,distances,length,duration};
}
export const metroLegs=stations.map((from,i)=>makeLeg(from,stations[nextIndex(i)]));
export const railwayMeters=metroLegs.reduce((sum,leg)=>sum+leg.length,0);
export function railPoint(leg,distance){
  const {distances,points,length}=leg,d=clamp(distance,0,length);
  let lo=1,hi=distances.length-1;
  while(lo<hi){
    const i=(lo+hi)>>1;
    if(distances[i]<d)lo=i+1;else hi=i;
  }
  const a=points[lo-1],b=points[lo],t=(d-distances[lo-1])/(distances[lo]-distances[lo-1]);
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
export function railPose(leg,distance){
  const [x,z]=railPoint(leg,distance),a=railPoint(leg,distance-4),b=railPoint(leg,distance+4);
  const [dx,dz]=unit(b[0]-a[0],b[1]-a[1]);
  return {x,y:trackY,z,dx,dz,yaw:Math.atan2(dx,-dz)};
}
export function trainCarPose(leg,distance){
  if(distance<0){const before=metroLegs[previousIndex(leg.from.index)];return railPose(before,before.length+distance);}
  return distance>leg.length?railPose(metroLegs[leg.to.index],distance-leg.length):railPose(leg,distance);
}
function travelFraction(t){
  const p=clamp(t,0,1),r=.12;
  if(p<r)return p*p/(2*r*(1-r));
  if(p>1-r)return 1-(1-p)**2/(2*r*(1-r));
  return (p-r*.5)/(1-r);
}
export function trainState(train,now){
  const origin=stationById.get(train?.from);
  if(!origin)return null;
  const incoming=metroLegs[previousIndex(origin.index)],outgoing=metroLegs[origin.index];
  if(!train.boardedAt){
    const elapsed=now-train.calledAt;
    if(elapsed>arrivalDelay+dwell)return null;
    const t=clamp(elapsed/arrivalDelay,0,1);
    return {phase:t===1?'ready':'approaching',leg:incoming,distance:incoming.length-(1-t)**2*136,station:origin};
  }
  const elapsed=now-train.boardedAt-departureDelay;
  if(elapsed<=0)return {phase:'departing',leg:outgoing,distance:0,station:outgoing.to};
  if(elapsed>=outgoing.duration)return {phase:'arrived',leg:outgoing,distance:outgoing.length,station:outgoing.to};
  return {phase:'riding',leg:outgoing,distance:outgoing.length*travelFraction(elapsed/outgoing.duration),station:outgoing.to};
}
export function nearestStation(x,z,max=11){
  return stations.find(stop=>{const [a,b]=stationEntry(stop);return Math.hypot(a-x,b-z)<=max;});
}
function platformPlayer(player,station){
  const [x,z]=stationPoint(station,-4,4.25),[dx,dz]=station.tangent;
  const view=Math.atan2(dx,-dz)-2.37,yaw=Math.atan2(Math.sin(view),Math.cos(view));
  return {...player,x,z,y:platformY,city:station.city,yaw,vx:0,vy:0,vz:0,vehicle:false,station:station.id,train:null};
}
export function metroAction(player,kind,now){
  if(kind==='metro-enter'){
    const station=!player.vehicle&&!player.station&&nearestStation(player.x,player.z);
    return station?platformPlayer(player,station):null;
  }
  if(!player.station)return null;
  const state=trainState(player.train,now);
  if(kind==='metro-call'&&!state)return {...player,train:{from:player.station,calledAt:now,boardedAt:0}};
  if(kind==='metro-board'&&state?.phase==='ready'){
    const [x,z]=stationPoint(state.station,-4,2);
    if(Math.hypot(player.x-x,player.z-z)>13)return null;
    return {...player,vx:0,vy:0,vz:0,train:{...player.train,boardedAt:now}};
  }
  return kind==='metro-leave'&&state?.phase==='arrived'?platformPlayer(player,state.station):null;
}
export function restoreTransit(previous){
  const station=stationById.get(previous.station);
  if(!station||stationSupport(station.id,previous.x,previous.z)===null)
    return previous.vehicle===true&&Number.isSafeInteger(previous.vehicleId)&&previous.vehicleId>=0?
      {vehicle:true,vehicleId:previous.vehicleId}:{};
  const saved=previous.train;
  const valid=saved?.from===station.id&&Number.isFinite(saved.calledAt)&&saved.calledAt>0&&Number.isFinite(saved.boardedAt)&&
    (saved.boardedAt===0||saved.boardedAt>=saved.calledAt);
  return {station:station.id,vehicle:false,train:valid?{from:saved.from,calledAt:saved.calledAt,boardedAt:saved.boardedAt}:null};
}
