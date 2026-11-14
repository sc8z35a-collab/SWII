export const PLAYER_HEIGHT=1.72;
export const launchSite={
  x:-72,z:1142,half:56,depth:22,lift:700,
  gate:{x:-72,z:1188,half:4.12,height:7.35},
  engines:[[-42,-33],[42,-33],[-42,0],[42,0],[-42,33],[42,33],[-17,-41],[17,-41]]
};
export const assemblyBounds=[launchSite.x-launchSite.half,launchSite.z-launchSite.half,
  launchSite.x+launchSite.half,launchSite.z+launchSite.half];
export const BOOK_TARGET=10;
export const EVACUATION_MS=14000;
export const ASCENT_MS=16000;
export const SURVIVAL_MS=600000;
export const FIRE_INTERVAL=10000;
export const CANNON_DROP=11.3;
export const CANNON_PITCH=Math.atan2(-.75,.63);
export const CANNON_MUZZLE=19.85;
export const atPad=(x,z,pad=0)=>Math.abs(x-launchSite.x)<launchSite.half+pad&&Math.abs(z-launchSite.z)<launchSite.half+pad;

export function launchHeight(phase,elapsed){
  if(phase==='books'||phase==='evacuate')return 0;
  if(phase!=='ascent')return launchSite.lift;
  const t=Math.max(0,Math.min(1,elapsed/ASCENT_MS));
  return launchSite.lift*t*t*t*(10+t*(-15+t*6));
}
