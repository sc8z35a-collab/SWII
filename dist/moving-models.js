import {airport} from './transport-layout.js';
import {trainCarPose} from './metro.js';

const rgb=new Map();
export const actorKinds=['box','chamfer','tube','ball','tri','cone','pyramid','taper','roof','effect'];
export const AIRCRAFT=34;
const cross=([a,b,c],[x,y,z])=>[b*z-c*y,c*x-a*z,a*y-b*x];
const normalize=a=>{const length=Math.hypot(...a)||1;return a.map(x=>x/length);};
const difference=(a,b)=>a.map((x,i)=>x-b[i]);
const tint=hex=>{
  if(!rgb.has(hex))rgb.set(hex,[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255));
  return rgb.get(hex);
};
export function meshTriangle(meshes,a,b,c,paint,mat){
  const u=difference(b,a),v=difference(c,a),normal=normalize(cross(u,v));
  (meshes.tri??=[]).push(...a,...u,...normal,...v,...tint(paint),mat);
}
export function meshFrame(meshes,{x,y,z,yaw,pitch=0}){
  const s=Math.sin(yaw),c=Math.cos(yaw),p=Math.sin(pitch),q=Math.cos(pitch);
  const right=[c,0,s],up=[-s*p,q,c*p],forward=[s*q,p,-c*q],back=forward.map(n=>-n);
  const point=(a,h,b)=>[x,y,z].map((n,i)=>n+right[i]*a+up[i]*h+forward[i]*b);
  const part=(kind,a,h,b,w,H,d,paint,mat=0,basis=[right,up,back])=>{
    (meshes[kind]??=[]).push(...point(a,h,b),...basis[0].map(n=>n*w),...basis[1].map(n=>n*H),
      ...basis[2].map(n=>n*d),...tint(paint),mat);
  };
  return {point,part,right,up,forward,back};
}
const packColor=hex=>parseInt(hex,16);
// Car instances for the detailed renderer: position, yaw, pitch, wheel spin, paint, flags, steering.
export function drawCar(meshes,player,pitch=0,spin=0,steer=0){
  if(meshes.detailed){
    const paint=player.wreck?'373638':player.paint??'477582';
    (meshes.cars??=[]).push(player.x,player.y+(player.parked?.014:.119)-.02,player.z,player.yaw,pitch,spin,
      packColor(paint),player.wreck?1:0,steer,0,0,0,0,0,0,0);
    return;
  }
  const {part,right,up,back}=meshFrame(meshes,{...player,y:player.y+(player.parked?.014:.119),pitch});
  const paint=player.wreck?'373638':player.paint??'477582';
  part('chamfer',0,.57,0,1.82,player.wreck?.45:.64,4.35,paint,player.wreck?58:25);
  part('taper',0,.97,-.26,1.59,player.wreck?.30:.54,2.31,player.wreck?'4a4c4a':'536976',player.wreck?58:10);
  part('chamfer',0,player.wreck?1.12:1.25,-.31,1.33,.12,1.91,paint,player.wreck?58:25);
  if(player.wreck)part('box',.20,.26,1.5,.64,.36,1.15,'242623',58);
  part('box',0,.39,2.143,1.59,.23,.126,'535c5b',25);
  part('box',0,.41,-2.14,1.62,.21,.127,'535c5b',25);
  const axle=[up,right,back.map(n=>-n)];
  for(const side of [-1,1]){
    part('box',side*.65,.68,2.10,.36,.134,.09,player.wreck?'443b33':'e9e1cb',player.wreck?58:7);
    part('box',side*.62,.66,-2.11,.31,.142,.085,player.wreck?'54413a':'af4647',player.wreck?58:7);
    part('box',side*.97,1.05,.55,.21,.11,.23,'4f717a',25);
    for(const along of [-1.31,1.31]){
      part('tube',side*.84,.34,along,.69,.24,.69,'333a3b',42,axle);
      part('tube',side*.977,.34,along,.30,.027,.30,'9fa6a4',25,axle);
    }
  }
}

export function planePose(seconds){
  const {elevation:y,terminal:[tx],runway:[,rz]}=airport,x=tx+112,turn=24;
  if(seconds<0||seconds>56)return null;
  if(seconds<4)return {x,y,z:2019,yaw:Math.PI};
  if(seconds<13){
    const progress=(seconds-4)/9;
    return {x,y,z:2019+(rz-turn-2019)*progress,yaw:Math.PI};
  }
  if(seconds<19){
    const a=(seconds-13)/6*Math.PI*.5;
    return {x:x-turn+turn*Math.cos(a),y,z:rz-turn+turn*Math.sin(a),yaw:-Math.PI+a};
  }
  const t=seconds-19,roll=12;
  const d=t<roll?3.05*t*t:3.05*roll*roll+3.05*roll*2*(t-roll),flight=Math.max(0,t-roll+1.35);
  const climb=flight<3?flight*flight*1.42:12.78+(flight-3)*12.1;
  return {x:x-turn-d,y:y+climb,z:rz,yaw:-Math.PI*.5,pitch:Math.min(.17,flight*.065),airborne:flight>0};
}
export function drawPlane(meshes,pose,paint='dce1dc'){
  const {part,point,right,up,forward,back}=meshFrame(meshes,pose),horizontal=[right,forward,up];
  const profile=[[-16.1,.07],[-15.2,.48],[-13.7,.98],[-11.3,1.49],[-8.8,1.87],
    [9.5,1.89],[11.6,1.74],[13.4,1.35],[14.9,.70],[15.8,.06]];
  const rings=profile.map(([along,radius])=>Array.from({length:12},(_,i)=>{
    const angle=i*Math.PI/6;
    return point(Math.cos(angle)*radius,3.25+Math.sin(angle)*radius,along);
  }));
  for(let i=1;i<rings.length;i++)for(let j=0;j<12;j++){
    const k=(j+1)%12,a=rings[i-1][j],b=rings[i-1][k],c=rings[i][k],d=rings[i][j];
    meshTriangle(meshes,a,c,b,paint,AIRCRAFT);meshTriangle(meshes,a,d,c,paint,AIRCRAFT);
  }
  part('ball',0,4.17,13.2,2.93,1.23,2.62,'617b83',10);
  for(const side of [-1,1]){
    const wing=[point(side*1.24,2.88,2.54),point(side*14.6,3.4,-5.57),
      point(side*14.36,3.39,-6.9),point(side*1.21,2.85,-5.05)];
    for(const [a,b,c] of [[0,1,2],[0,2,3]]){
      const [p,q,r]=side>0?[wing[a],wing[c],wing[b]]:[wing[a],wing[b],wing[c]];
      meshTriangle(meshes,p,q,r,'cbd4d3',AIRCRAFT);
    }
    part('chamfer',side*5.32,2.56,-.26,1.91,.53,2.4,'b5c0c2',25);
    part('tube',side*5.32,1.99,.21,2.13,3.17,2.1,'b2c2c4',AIRCRAFT,horizontal);
    part('tube',side*5.32,1.99,1.82,1.78,.10,1.77,'434f54',25,horizontal);
    part('box',side*14.38,3.81,-6.35,.13,.91,1.1,side===1?'69c792':'cf7469',7);
    part('chamfer',side*2.94,3.97,-12.10,6.1,.15,2.67,'a5b8bc',25);
    for(let i=0;i<12;i++)part('box',side*1.86,3.70,6.7-i*1.22,.071,.33,.45,'465f67',10);
    part('box',side*1.83,3.01,-.30,.11,.24,19.8,'476c77',25);
  }
  const fin=[point(0,3.43,-13.4),point(0,3.45,-6.8),point(0,9.1,-12.7),point(0,9.1,-14.3)];
  for(const [a,b,c] of [[0,1,2],[0,2,3]])meshTriangle(meshes,fin[a],fin[b],fin[c],'547b83',AIRCRAFT);
  if(!pose.airborne){
    for(const [side,along] of [[0,8.2],[-2.8,-3.3],[2.8,-3.3]]){
      part('box',side,.98,along,.18,1.39,.18,'757c7b',25);
      part('tube',side,.45,along,.88,.32,.88,'363f43',0,[up,right,back.map(n=>-n)]);
    }
  }
}

export function drawTrain(meshes,state){
  const {leg,distance,phase}=state,doors=phase==='ready'||phase==='arrived';
  for(const segment of [-1,0,1]){
    const {part,right,up,back}=meshFrame(meshes,trainCarPose(leg,distance+segment*15.1));
    const length=14.7;
    part('chamfer',0,.91,0,2.98,.42,length,'c6ccca',25);
    part('chamfer',0,3.60,0,2.94,.34,length,'bfc9c8',25);
    part('box',0,3.42,0,.15,.077,length*.87,'f3e7bd',7);
    for(const side of [-1,1]){
      part('box',side*1.43,1.35,0,.16,.55,length,'9caeaf',25);
      part('box',side*1.51,1.47,0,.054,.22,length,'51877f',25);
      part('box',side*1.43,3.10,0,.15,.38,length,'c2cdcb',25);
      for(const at of [-6.85,-3.1,0,3.1,6.85])part('box',side*1.43,2.30,at,.158,1.44,.31,'bdc6c4',25);
      for(const at of [-4.74,4.74]){
        if(!(doors&&side===1&&segment===0))part('box',side*1.41,2.34,at,.14,1.57,1.36,'879b9e',10);
        const seat=at<0?at+1.14:at-1.14;
        part('box',side*.98,1.42,seat,.64,.20,1.12,'66817a',24);
        part('box',side*1.27,1.68,seat,.16,.64,1.12,'66817a',24);
      }
      for(const at of [-4.9,4.9])part('tube',side*1.19,.47,at,.64,.24,.64,'414849',0,[up,right,back.map(n=>-n)]);
    }
    for(const end of [-1,1]){
      part('chamfer',0,2.17,end*7.13,2.94,2.76,.49,'748c91',10);
      part('box',0,1.17,end*7.41,1.9,.39,.074,'a9b4b2',25);
      for(const side of [-1,1])part('box',side*.90,1.63,end*7.411,.28,.18,.058,end===1?'ede9c8':'ca6863',7);
    }
  }
}
