import {airport} from './transport-layout.js';
import {trainCarPose} from './metro.js';
import {TRAIN_VARIANT,metroMaterial as m,metroQuad} from './metro-materials.js';

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
export const CAR_WRECK=1,CAR_BRAKE=2,CAR_REVERSE=4;
// Car instances for the detailed renderer: position, yaw, pitch, wheel spin, paint, flags, steering,
// and the body's own pitch and roll on its suspension. lights adds CAR_BRAKE and CAR_REVERSE.
export function drawCar(meshes,player,pitch=0,spin=0,steer=0,{lights=0,bodyPitch=0,bodyRoll=0}={}){
  if(meshes.detailed){
    const paint=player.wreck?'373638':player.paint??'477582';
    (meshes.cars??=[]).push(player.x,player.y+(player.parked?-.006:.012),player.z,player.yaw,pitch,spin,
      packColor(paint),(player.wreck?CAR_WRECK:0)|(player.wreck?0:lights),steer,bodyPitch,bodyRoll,0,0,0,0,0);
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

function trainCarTemplate(segment,doors){
  const meshes={};
  const variant=segment===1?TRAIN_VARIANT:0;
  const {point}=meshFrame(meshes,{x:0,y:0,z:0,yaw:0});
  const half=7.35,side=1.48,bottom=1.12,top=3.52;
  const quad=(points,material,options)=>metroQuad(meshes,points.map(p=>point(...p)),material+variant,options);
  const horizontal=(width,y,material,flip)=>quad(
    [[-width,y,half],[width,y,half],[width,y,-half],[-width,y,-half]],material,{v:3,flip});
  horizontal(side,top,m.trainRoof,true);
  horizontal(side-.035,top-.025,m.trainCeiling,false);
  horizontal(side,bottom,m.trainFloor,true);
  for(const sign of [-1,1]){
    const x=side*sign,inner=x-.035*sign;
    const sideQuad=(x,first,last,upper,lower,material,flip)=>quad(
      [[x,upper,first],[x,upper,last],[x,lower,last],[x,lower,first]],material,{flip});
    const cuts=[-half,-5.42,-4.06,4.06,5.42,half];
    for(let i=1;i<cuts.length;i++){
      const first=cuts[i-1],last=cuts[i],door=i===2||i===4;
      if(door&&doors&&sign===1&&segment===0){
        sideQuad(x,first,last,top,3.12,m.trainSide,sign===1);
        continue;
      }
      sideQuad(x,first,last,top,bottom,door?m.trainDoor:m.trainSide,sign===1);
      sideQuad(inner,first,last,top-.025,bottom,door?m.trainDoor:m.trainWall,sign===-1);
    }
    for(const z of [-4.9,4.9])sideQuad(x,z-1.40,z+1.40,bottom,.19,m.trainBogie,sign===1);
  }
  for(const end of [-1,1]){
    const z=end*half,outer=segment===end;
    quad([[-side,top,z],[side,top,z],[side,bottom,z],[-side,bottom,z]],outer?m.trainCab:m.trainEnd,{flip:end===-1});
    const inside=z-.035*end;
    quad([[-side,top,inside],[side,top,inside],[side,bottom,inside],[-side,bottom,inside]],m.trainEnd,{flip:end===1});
  }
  return meshes.tri;
}
const carTemplates=new Map();
export function drawTrain(meshes,{leg,distance,phase}){
  const triangles=meshes.tri??=[],open=phase==='ready'||phase==='arrived';
  for(const segment of [-1,0,1]){
    const doors=open&&segment===0,key=doors?'open':segment;
    if(!carTemplates.has(key))carTemplates.set(key,trainCarTemplate(segment,doors));
    const source=carTemplates.get(key);
    const {x,y,z,yaw}=trainCarPose(leg,distance+segment*15.1),c=Math.cos(yaw),s=Math.sin(yaw);
    // Rotate the origin and three basis vectors; only the origin translates.
    for(let i=0;i<source.length;i+=16){
      triangles.push(x+c*source[i]-s*source[i+2],y+source[i+1],z+s*source[i]+c*source[i+2]);
      for(let k=i+3;k<i+12;k+=3)
        triangles.push(c*source[k]-s*source[k+2],source[k+1],s*source[k]+c*source[k+2]);
      triangles.push(source[i+12],source[i+13],source[i+14],source[i+15]);
    }
  }
}
const emptyTrain={};
let previousTrain=null;
export function trainMeshes(state){
  if(!state)return emptyTrain;
  const {leg,distance,phase}=state;
  if(previousTrain?.leg===leg&&previousTrain.distance===distance&&previousTrain.phase===phase)return previousTrain.meshes;
  const meshes={};
  drawTrain(meshes,state);
  previousTrain={leg,distance,phase,meshes};
  return meshes;
}
