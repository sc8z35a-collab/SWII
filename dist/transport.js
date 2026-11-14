import {airport} from './transport-layout.js';
import {districtAt} from './geography.js';
import {roadTunnels,tunnelPoint} from './road-tunnels.js';
import {metroAction,stationById,stationEntry,stationSupport,stations} from './metro.js';
import {switchVehicle} from './driving.js';
import {parkLocations} from './park-locations.js';

export const transportActions=new Set(['vehicle','metro-enter','metro-exit','metro-call','metro-board','metro-leave']);
export const waypoints=[
  {id:'airport-deck',name:airport.name+' 展望デッキ',point:airport.watch,yaw:Math.PI},
  ...roadTunnels.map(t=>({id:t.id,name:t.name,point:tunnelPoint(t,-5),yaw:Math.atan2(t.dx,-t.dz)})),
  ...stations.map(s=>({id:'station-'+s.id,name:s.name+'駅',point:stationEntry(s),yaw:Math.PI})),
  ...parkLocations
];
const destinationById=new Map(waypoints.map(point=>[point.id,point]));
export function transportDestination(player,kind,value){
  if(kind==='waypoint')return destinationById.get(value);
  const station=kind==='metro-exit'&&!player.train?.boardedAt&&stationById.get(player.station);
  if(station)return {point:stationEntry(station),yaw:-Math.PI*.5};
}
export function resolveTransport(player,kind,value,now,terrain){
  const target=transportDestination(player,kind,value);
  if(target){
    const [x,z]=target.point,y=terrain.support(x,z);
    if(y===null)return null;
    return {x,z,y,yaw:target.yaw,vx:0,vy:0,vz:0,city:districtAt(x,z)};
  }
  return kind==='vehicle'?switchVehicle(player,terrain):metroAction(player,kind,now);
}
export function playerFloor(player,terrain){
  return player.station?stationSupport(player.station,player.x,player.z):terrain.support(player.x,player.z,player.y,player.vehicleId);
}
