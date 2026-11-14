const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const wrap=yaw=>Math.atan2(Math.sin(yaw),Math.cos(yaw));
export const CAR_SPEED=30;
export const VEHICLE_REACH=3.05;
const edges=[[-.82,-1.95],[0,-1.98],[.82,-1.95],[-.91,0],[.91,0],[-.82,1.95],[0,1.98],[.82,1.95]];
function carGround(terrain,x,z,yaw,level,id){
  const ground=terrain.support(x,z,level,id);
  if(ground===null)return null;
  const s=Math.sin(yaw),c=Math.cos(yaw);
  for(const [side,along] of edges){
    const floor=terrain.support(x+c*side+s*along,z+s*side-c*along,level,id);
    if(floor===null||Math.abs(floor-ground)>.81)return null;
  }
  return ground;
}
export function nearVehicle(player,vehicles){
  if(player.station||player.vehicle)return null;
  let closest=null,distance=VEHICLE_REACH;
  for(const car of vehicles){
    if(car.wreck)continue;
    const gap=Math.hypot(car.x-player.x,car.z-player.z,(car.y-player.y)*2);
    if(gap<distance){closest=car;distance=gap;}
  }
  return closest;
}
export function switchVehicle(player,terrain,car=null){
  if(player.station)return null;
  const s=Math.sin(player.yaw),c=Math.cos(player.yaw);
  if(player.vehicle){
    if(Math.hypot(player.vx,player.vz)>1.35)return null;
    for(const [a,b] of [[-1.53,0],[1.53,0],[0,-2.63],[0,2.63],[-1.60,1.4],[1.60,1.4],[-1.60,-1.4],[1.60,-1.4]]){
      const x=player.x+a*c+b*s,z=player.z+a*s-b*c,y=terrain.support(x,z,player.y);
      if(y!==null&&Math.abs(y-player.y)<.85)return {...player,x,y,z,vehicle:false,vehicleId:null,vx:0,vy:0,vz:0};
    }
    return null;
  }
  if(car&&nearVehicle(player,[car])){
    const {x,z}=car,yaw=wrap(car.yaw),y=carGround(terrain,x,z,yaw,car.y,car.id);
    if(y!==null&&Math.abs(y-player.y)<.85)return {...player,x,y,z,yaw,vehicle:true,vehicleId:car.id,vx:0,vy:0,vz:0};
  }
  return null;
}
export function stepVehicle(player,input,dt,terrain){
  const throttle=input[1],steer=input[2],brake=input[4],s=Math.sin(player.yaw),c=Math.cos(player.yaw);
  const before=player.vx*s-player.vz*c,opposite=before*throttle<-.02;
  const resistance=brake?13:opposite?9.6:throttle?0:3.25;
  const reduced=Math.sign(before)*Math.max(0,Math.abs(before)-resistance*dt);
  const acceleration=brake||opposite?0:throttle*(throttle>0?7.2:5.7);
  const speed=clamp(reduced+acceleration*dt,-8,CAR_SPEED);
  const turn=steer*Math.sign(speed)*Math.min(Math.abs(speed)/3.2,1)*1.32/(1+Math.abs(speed)*.032);
  const yaw=wrap(player.yaw+turn*dt),vx=Math.sin(yaw)*speed,vz=-Math.cos(yaw)*speed;
  const x=player.x+vx*dt,z=player.z+vz*dt,ground=carGround(terrain,x,z,yaw,player.y,player.vehicleId);
  if(ground===null||Math.abs(ground-player.y)>.48){player.vx=player.vz=0;return;}
  Object.assign(player,{x,y:ground,z,yaw,vx,vy:0,vz});
}
