import {districtAt,limits,TILE_SIZE,toGlobal,waterLevel} from './geography.js';
import {overlaps,platformHeight,sampleHeight,terrainWater} from './tiles.js';
import {cities} from './world.js';
import {stepVehicle} from './driving.js';
import {tunnelSupport} from './road-tunnels.js';
import {stationSupport} from './metro.js';

export const PROTOCOL=4;
export const STEP_MS=1000/60;
export const MOVE_INTERVAL=100;
export const MAX_BATCH_MS=230;
const MAX_SAMPLE_MS=110;
export const WALK_SPEED=9;
export const RUN_SPEED=21;
export const LOOK_SPEED=1.65;
const GRAVITY=20;
export const cityById=new Map(cities.map(city=>[city.id,city]));
export const landmarks=new Map(cities.map(city=>[city.id,city.spots.map(([id,name,hint,x,z])=>[id,name,hint,...toGlobal(city.id,x,z)])]));
export const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
export const heading=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

export function spawn(cityId='tokyo'){
  const city=cityById.get(cityId)??cities[0];
  const [x,z]=toGlobal(city.id,...city.spawn),[, , ,a,b]=landmarks.get(city.id)[0];
  return {x,z,y:0,yaw:Math.atan2(a-x,z-b),vx:0,vy:0,vz:0,city:city.id};
}
const collisionCells=16,collisionStep=TILE_SIZE/collisionCells,emptyOffsets=[];
const cell=value=>clamp(Math.floor(value/collisionStep),0,collisionCells-1);
function collisionBins(tile,list,stride,pad=0){
  if(list.length<stride*16)return null;
  const bins=new Array(collisionCells**2);
  for(let i=0;i<list.length;i+=stride){
    const x=list[i]-tile.x,z=list[i+1]-tile.z;
    const c=Math.abs(list[i+4]),s=Math.abs(list[i+5]);
    const w=list[i+2]+pad,d=list[i+3]+pad;
    const inverse=1/(c*c+s*s);
    const rx=(c*w+s*d)*inverse+.002,rz=(s*w+c*d)*inverse+.002;
    const minX=cell(x-rx),maxX=cell(x+rx),minZ=cell(z-rz),maxZ=cell(z+rz);
    for(let a=minX;a<=maxX;a++)for(let b=minZ;b<=maxZ;b++){
      const index=b*collisionCells+a;
      (bins[index]??=[]).push(i);
    }
  }
  return bins;
}

export function terrainSampler(cache,world){
  const indexes=new WeakMap();
  let lastTile;
  function support(x,z,level,ignoreCar){
    if(x<limits.west+1||x>limits.east-1||z<limits.north+1||z>limits.south-1)return null;
    const tile=lastTile&&x>=lastTile.x&&x<lastTile.x+TILE_SIZE&&z>=lastTile.z&&z<lastTile.z+TILE_SIZE?lastTile:cache.at(x,z);
    if(!tile)return null;
    lastTile=tile;
    const below=tunnelSupport(x,z,level);
    if(below!==undefined)return below;
    if(world?.carObstacle(x,z,level,ignoreCar))return null;
    const plaza=world?.plazaFloor(x,z,level);
    if(plaza!==undefined)return plaza;
    let index=indexes.get(tile);
    if(!index){
      index={solids:collisionBins(tile,tile.solids,6,.37),decks:collisionBins(tile,tile.decks,6),
        platforms:collisionBins(tile,tile.platforms,8)};
      indexes.set(tile,index);
    }
    const bin=cell(z-tile.z)*collisionCells+cell(x-tile.x);
    if(overlaps(tile.solids,x,z,.37,index.solids?index.solids[bin]??emptyOffsets:null))return null;
    const y=sampleHeight(tile,x,z);
    const deck=overlaps(tile.decks,x,z,0,index.decks?index.decks[bin]??emptyOffsets:null);
    if(!deck&&terrainWater(tile,x,z,y))return null;
    const ground=deck?Math.max(y,(waterLevel(x,z)??-.52)+.61):y;
    return platformHeight(tile.platforms,x,z,ground,index.platforms?index.platforms[bin]??emptyOffsets:null);
  }
  function terrainOccludes(a,b){
    const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/1.4));
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
      const tile=cache.at(x,z);
      if(!tile)continue;
      const plaza=world?.plazaFloor(x,z,y);
      if(plaza!==undefined){
        if(plaza!==null&&y<plaza-.12)return true;
      }else if(y<sampleHeight(tile,x,z)-.12&&tunnelSupport(x,z,y)==null)return true;
    }
    return false;
  }
  return {support,terrainOccludes};
}
export function stepMotion(player,input,ms,terrain){
  const dt=ms/1000,forward=input[1],side=input[2],yaw=input[3],run=input[4];
  if(player.vehicle){stepVehicle(player,input,dt,terrain);return;}
  if(player.train?.boardedAt)return;
  const support=(x,z)=>player.station?stationSupport(player.station,x,z):terrain.support(x,z,player.y,player.clearWreck);
  const magnitude=Math.max(1,Math.hypot(forward,side)),speed=(run?RUN_SPEED:WALK_SPEED)/magnitude;
  const sine=Math.sin(yaw),cosine=Math.cos(yaw);
  const vx=(sine*forward+cosine*side)*speed,vz=(-cosine*forward+sine*side)*speed;
  const dx=vx-player.vx,dz=vz-player.vz,distance=Math.hypot(dx,dz);
  const max=(forward!==0||side!==0?33:43)*dt;
  if(distance<=max){player.vx=vx;player.vz=vz;}
  else{player.vx+=dx*max/distance;player.vz+=dz*max/distance;}
  player.yaw=yaw;
  const ground=support(player.x,player.z);
  if(ground===null){player.vx=player.vz=0;return;}
  const limit=Math.max(player.y,ground)+Math.max(.28,dt*RUN_SPEED*.8);
  let currentY=ground;
  const x=player.x+player.vx*dt,z=player.z+player.vz*dt;
  const diagonal=player.vx&&player.vz?support(x,z):null;
  if(diagonal!==null&&diagonal<=limit&&support((x+player.x)*.5,(z+player.z)*.5)!==null){
    player.x=x;player.z=z;currentY=diagonal;
  }else{
    if(player.vx!==0){
      const next=support(x,player.z);
      if(next!==null&&next<=limit){player.x=x;currentY=next;}else player.vx=0;
    }
    if(player.vz!==0){
      const next=support(player.x,z);
      if(next!==null&&next<=limit){player.z=z;currentY=next;}else player.vz=0;
    }
  }
  if(player.y<=currentY){
    player.y=currentY;player.vy=0;
  }else{
    player.vy=Math.max(-19,(player.vy??0)-GRAVITY*dt);
    player.y=Math.max(currentY,player.y+player.vy*dt);
    if(player.y===currentY)player.vy=0;
  }
}
export function simulate(player,samples,terrain,maxMs=MAX_BATCH_MS,metrics){
  let left=maxMs,spent=0;
  for(const input of samples){
    let time=Math.min(left,input[0]);
    left-=time;spent+=time;
    while(time>1e-6){
      const dt=Math.min(time,STEP_MS);
      const {x,z}=player;
      stepMotion(player,input,dt,terrain);time-=dt;
      if(metrics)metrics.distance+=Math.hypot(player.x-x,player.z-z);
    }
    if(left<=0)break;
  }
  player.city=districtAt(player.x,player.z);
  return spent;
}
export function keepCameraOutOfWalls(player,offset,terrain){
  const support=(x,z)=>player.station?stationSupport(player.station,x,z):terrain.support(x,z,player.y);
  const floor=support(player.x,player.z);
  if(floor!==null)offset[1]=Math.max(offset[1],floor-player.y-.20);
  const steps=Math.ceil(Math.hypot(offset[0],offset[2])/.25);
  for(let i=1;i<=steps;i++){
    const x=player.x+offset[0]*i/steps,z=player.z+offset[2]*i/steps;
    const ground=support(x,z);
    if(ground===null||ground>player.y+offset[1]+.26){
      offset[0]=offset[2]=0;
      break;
    }
  }
}
export function frameInputs(elapsed,forward,side,yaw,run){
  const samples=[];
  for(let left=Math.min(elapsed,MAX_BATCH_MS);left>0;){
    const ms=Math.min(left,MAX_SAMPLE_MS);
    samples.push([ms,forward,side,yaw,run]);
    left-=ms;
  }
  return samples;
}
export const idleDrive=(idle,samples)=>idle&&samples.every(input=>input[1]===0&&input[2]===0);

export function readInputs(input){
  if(!Array.isArray(input)||input.length<1||input.length>8)return null;
  let ms=0;
  for(const row of input){
    if(!Array.isArray(row)||row.length!==5||!Number.isFinite(row[0])||row[0]<=0||row[0]>MAX_SAMPLE_MS||
       !Number.isFinite(row[1])||Math.abs(row[1])>1||!Number.isFinite(row[2])||Math.abs(row[2])>1||
       !Number.isFinite(row[3])||Math.abs(row[3])>Math.PI+.001||typeof row[4]!=='boolean')return null;
    ms+=row[0];
  }
  return ms<=MAX_BATCH_MS?input:null;
}
export function discoverable(player,city,id){
  if(player.city!==city||player.station)return null;
  const spot=landmarks.get(city)?.find(s=>s[0]===id);
  return spot&&Math.hypot(player.x-spot[3],player.z-spot[4])<=6?spot:null;
}
