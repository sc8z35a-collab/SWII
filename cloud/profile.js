import {WORLD_VERSION,districtAt,limits} from '../dist/geography.js';
import {heading,landmarks,spawn} from '../dist/physics.js';
import {restoreTransit} from '../dist/metro.js';

const worlds=new Set([WORLD_VERSION,'atlas-11','atlas-10','atlas-9','atlas-8','atlas-7','atlas-6','atlas-5','atlas-4','atlas-3']);
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
export const nonnegative=value=>Math.max(0,finite(value,0));

export function restorePlayer(previous){
  if(!previous||!Number.isFinite(previous.x)||!Number.isFinite(previous.z)||
    previous.x<limits.west+1||previous.x>limits.east-1||
    previous.z<limits.north+1||previous.z>limits.south-1)return null;
  const {x,z}=previous,city=districtAt(x,z),initial=spawn(city);
  return {x,z,city,y:finite(previous.y,0),yaw:heading(finite(previous.yaw,initial.yaw)),
    vx:finite(previous.vx,0),vy:finite(previous.vy,0),vz:finite(previous.vz,0),...restoreTransit(previous),
    ...(Number.isSafeInteger(previous.clearWreck)?{clearWreck:previous.clearWreck}:{})};
}

export function restoreJourney(raw){
  let saved;
  try{saved=JSON.parse(raw??'null');}catch{}
  const player=worlds.has(saved?.world)?restorePlayer(saved.player):null;
  const stamps={};
  for(const [city,spots] of landmarks){
    const recorded=saved?.stamps?.[city];
    if(Array.isArray(recorded))stamps[city]=spots.map(spot=>spot[0]).filter(id=>recorded.includes(id));
  }
  return {player:player??spawn(saved?.player?.city),revision:Number.isSafeInteger(saved?.revision)?nonnegative(saved.revision):0,
    stamps,traveled:nonnegative(saved?.traveled),
    started:saved?.started===true,dirty:raw!=null&&(!player||saved?.world!==WORLD_VERSION||saved?.time!==undefined)};
}
