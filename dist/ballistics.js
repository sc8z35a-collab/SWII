// RD II: a three-barrel 9 mm pistol. One pull of the trigger fires all three barrels at once.
// The rounds are integrated with gravity and quadratic air drag, the same values as a
// 124 grain 9 × 19 mm full metal jacket bullet at sea level.
const AIR_DENSITY=1.225,DRAG_COEFFICIENT=.354,BULLET_DIAMETER=.009,BULLET_MASS=.00804;
const area=Math.PI*(BULLET_DIAMETER*.5)**2;
export const RD2={
  name:'RD II',
  barrels:3,
  magazine:120,
  startingRounds:250,
  pickupRounds:15,
  muzzleVelocity:375,
  mass:BULLET_MASS,
  // Deceleration is drag × speed²: about 242 m/s² at the muzzle and 150 m/s² after 150 m.
  drag:.5*AIR_DENSITY*DRAG_COEFFICIENT*area/BULLET_MASS,
  gravity:9.80665,
  cycleMs:190,
  reloadMs:1700,
  lifeMs:1700,
  range:430,
  // The outer barrels are toed out by a quarter of a degree (radians between neighbours).
  spread:.0045,
  stunHits:20,
  stunMs:180000
};
export const muzzleDeceleration=RD2.drag*RD2.muzzleVelocity**2;
const MAX_STEP=.012;

// Advances one round and returns the points it passed through, so that a fast bullet
// is tested against the world in short straight pieces.
export function stepBullet(bullet,seconds,visit,gun=RD2,steer){
  let left=seconds;
  while(left>1e-6){
    const dt=Math.min(left,MAX_STEP);
    left-=dt;
    const speed=Math.hypot(bullet.vx,bullet.vy,bullet.vz),slow=gun.drag*speed*dt;
    steer?.(bullet,dt,speed);
    // Semi-implicit drag stays stable for any step size.
    const keep=1/(1+slow);
    bullet.vx*=keep;bullet.vz*=keep;
    bullet.vy=(bullet.vy-gun.gravity*dt)*keep;
    const from=[bullet.x,bullet.y,bullet.z];
    const to=[bullet.x+bullet.vx*dt,bullet.y+bullet.vy*dt,bullet.z+bullet.vz*dt];
    bullet.age+=dt*1000;
    bullet.travel+=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    if(visit(from,to)===false)return false;
    [bullet.x,bullet.y,bullet.z]=to;
  }
  return bullet.age<gun.lifeMs&&bullet.travel<gun.range;
}

export function aimDirection(yaw,pitch){
  const c=Math.cos(pitch);
  return [Math.sin(yaw)*c,Math.sin(pitch),-Math.cos(yaw)*c];
}

// Closest approach of the segment a→b to the vertical capsule standing on base.
// Returns the position along the segment (0…1) or null when it misses.
export function segmentHitsCapsule(a,b,base,height,radius){
  const low=base[1]+Math.min(radius,height*.5),high=base[1]+Math.max(height-radius,height*.5);
  const d1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],d2=[0,high-low,0];
  const r=[a[0]-base[0],a[1]-low,a[2]-base[2]];
  const A=d1[0]*d1[0]+d1[1]*d1[1]+d1[2]*d1[2],E=d2[1]*d2[1],F=d2[1]*r[1];
  const C=d1[0]*r[0]+d1[1]*r[1]+d1[2]*r[2],B=d1[1]*d2[1];
  let s,t;
  if(A<1e-9){s=0;t=E>1e-9?Math.max(0,Math.min(1,F/E)):0;}
  else if(E<1e-9){t=0;s=Math.max(0,Math.min(1,-C/A));}
  else{
    const denom=A*E-B*B;
    s=denom>1e-9?Math.max(0,Math.min(1,(B*F-C*E)/denom)):0;
    t=(B*s+F)/E;
    if(t<0){t=0;s=Math.max(0,Math.min(1,-C/A));}
    else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-C)/A));}
  }
  const dx=r[0]+d1[0]*s,dy=r[1]+d1[1]*s-d2[1]*t,dz=r[2]+d1[2]*s;
  if(dx*dx+dy*dy+dz*dz>radius*radius)return null;
  // Step back to where the round enters the body.
  const length=Math.sqrt(A)||1;
  return Math.max(0,s-Math.sqrt(Math.max(0,radius*radius-(dx*dx+dy*dy+dz*dz)))/length);
}

export function segmentHitsSphere(a,b,center,radius){
  const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],m=[a[0]-center[0],a[1]-center[1],a[2]-center[2]];
  const A=d[0]*d[0]+d[1]*d[1]+d[2]*d[2];
  if(A<1e-9)return m[0]*m[0]+m[1]*m[1]+m[2]*m[2]<=radius*radius?0:null;
  const B=m[0]*d[0]+m[1]*d[1]+m[2]*d[2],C=m[0]*m[0]+m[1]*m[1]+m[2]*m[2]-radius*radius;
  if(C<=0)return 0;
  const disc=B*B-A*C;
  if(disc<0)return null;
  const t=(-B-Math.sqrt(disc))/A;
  return t>=0&&t<=1?t:null;
}
