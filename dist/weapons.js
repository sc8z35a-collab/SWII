import {aimDirection,RD2} from './ballistics.js';
import {PLAYER_HEIGHT} from './mission-layout.js';

export const INK_CAPACITY=1000; // Tenths of one ink unit.
export const weaponOrder=['rd2','sr1t','h1','shielder'];
export const weapons={
  rd2:RD2,
  sr1t:{name:'SR1T',magazine:5,inkCost:8,barrels:1,cycleMs:500,reloadMs:RD2.reloadMs,
    muzzleVelocity:92,gravity:11,drag:.003,lifeMs:560,range:44,damage:.9,paint:1.05,color:'50d6ef'},
  h1:{name:'H1',inkCost:30,barrels:1,cycleMs:200,reloadMs:RD2.reloadMs,
    muzzleVelocity:65,gravity:21,drag:.008,lifeMs:950,range:55,damage:1,paint:3.15,color:'40efaa'},
  shielder:{name:'シールダー01',inkCost:40,barrels:1,cycleMs:900,reloadMs:RD2.reloadMs,
    muzzleVelocity:112,gravity:13,drag:.004,lifeMs:750,range:68,damage:1,paint:1.4,color:'a6a7ff',protection:.8}
};
export const lockRange=32;
export const lockLife=420;
export const enemyInkColor='f77a61';
export const inkRounds=(gun,ink)=>Math.min(gun.magazine??Infinity,Math.floor(ink/gun.inkCost));
export const weaponById=id=>Object.hasOwn(weapons,id)?weapons[id]:null;

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function lockWindow(remaining){
  const charge=Math.max(0,Math.min(5,remaining))/5;
  return {halfWidth:.12+.07*charge,halfHeight:.12-.03*charge};
}
export function aimPoint(actor){
  return [actor.x,actor.y+(actor.face===undefined?PLAYER_HEIGHT*(actor.scale??1)*.60:actor.hover),actor.z];
}

// Project to the camera plane in the same units used by the red HUD rectangle.
export function findLock(eye,yaw,pitch,window,targets,visible){
  const forward=aimDirection(yaw,pitch),right=[Math.cos(yaw),0,Math.sin(yaw)],up=aimDirection(yaw,pitch+Math.PI/2);
  let closest=null;
  for(const target of targets){
    if(target.stun>0||!Number.isFinite(target.y))continue;
    const point=aimPoint(target),delta=point.map((n,i)=>n-eye[i]);
    const depth=dot(delta,forward);
    if(depth<.3||Math.hypot(...delta)>lockRange)continue;
    const x=dot(delta,right)/depth,y=dot(delta,up)/depth;
    if(Math.abs(x)>window.halfWidth||Math.abs(y)>window.halfHeight)continue;
    const score=(x/window.halfWidth)**2+(y/window.halfHeight)**2+depth*.003;
    if((!closest||score<closest.score)&&visible(eye,point))closest={id:target.id,x,y,score};
  }
  return closest;
}

// Limit the direction change per step so a guided ink round bends toward a moving target.
export function steerInk(round,point,dt,speed){
  const velocity=[round.vx,round.vy,round.vz].map(n=>n/speed);
  const delta=[point[0]-round.x,point[1]-round.y,point[2]-round.z],length=Math.hypot(...delta);
  if(length<.01)return;
  const wanted=delta.map(n=>n/length),angle=Math.acos(Math.max(-1,Math.min(1,dot(velocity,wanted))));
  if(angle>Math.PI/2)return;
  const turn=Math.min(angle,8*dt),sine=Math.sin(angle);
  const direction=angle<1e-5?wanted:velocity.map((n,i)=>(n*Math.sin(angle-turn)+wanted[i]*Math.sin(turn))/sine);
  [round.vx,round.vy,round.vz]=direction.map(n=>n*speed);
}
