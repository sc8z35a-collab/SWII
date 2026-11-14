import {districtAt,limits,WORLD_VERSION} from './geography.js';
import {clamp,heading,spawn} from './physics.js';
import {restoreTransit} from './metro.js';

export const positionKey='atlantis.position.'+WORLD_VERSION;
const positionKeys=[positionKey,...[11,10,9,8,7,6,5,4,3].map(version=>'atlantis.position.atlas-'+version)];
export const startPitch=.035;
export const clampPitch=value=>clamp(Number.isFinite(value)?value:startPitch,-1.21,1.36);

export function readCheckpoint(storage){
  for(const key of positionKeys){
    let saved;
    try{saved=JSON.parse(storage.getItem(key));}catch{continue;}
    if(!saved||!Number.isFinite(saved.x)||!Number.isFinite(saved.z)||!Number.isFinite(saved.yaw)||
      saved.x<=limits.west+1||saved.x>=limits.east-1||saved.z<=limits.north+1||saved.z>=limits.south-1)continue;
    return {...spawn(districtAt(saved.x,saved.z)),x:saved.x,z:saved.z,yaw:heading(saved.yaw),pitch:clampPitch(saved.pitch),
      y:clamp(Number.isFinite(saved.y)?saved.y:0,-60,1500),...(key===positionKey||key===positionKeys[1]?restoreTransit(saved):{})};
  }
  return null;
}

export function persistCheckpoint(storage,previous,next){
  if(previous&&previous.x===next.x&&previous.z===next.z&&previous.y===next.y&&
    previous.station===next.station&&previous.vehicle===next.vehicle&&previous.train===next.train&&
    Math.abs(heading(next.yaw-previous.yaw))<1e-6&&Math.abs(next.pitch-previous.pitch)<1e-6)return previous;
  storage.setItem(positionKey,JSON.stringify(next));
  return next;
}
