import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_VERSION,toTile,waterLevel} from '../dist/geography.js';
import {decodeTile,tilePath} from '../dist/tiles.js';
import {simulate,spawn,terrainSampler} from '../dist/physics.js';
import {roadTunnels,tunnelFloor,tunnelPoint,tunnelSupport} from '../dist/road-tunnels.js';
import {metroLegs,metroAction,platformY,railPose,railwayMeters,stationEntry,stationPoint,stationSupport,stations,trainState} from '../dist/metro.js';
import {airport} from '../dist/transport-layout.js';
import {switchVehicle} from '../dist/driving.js';
import {metroBatches} from '../dist/metro-scene.js';
import {TRAIN_VARIANT,METRO_MATERIAL_BASE,metroMaterial,metroUv} from '../dist/metro-materials.js';
import {drawTrain,trainMeshes,planePose} from '../dist/moving-models.js';
import {resolveTransport,waypoints} from '../dist/transport.js';

const tiles=new Map(),base=new URL('../dist/',import.meta.url);
const terrain=terrainSampler({at(x,z){
  const [a,b]=toTile(x,z),key=a+','+b;
  if(!tiles.has(key)){
    const bytes=Uint8Array.from(readFileSync(new URL(tilePath(a,b,false),base)));
    tiles.set(key,decodeTile(bytes.buffer,a,b,false));
  }
  return tiles.get(key);
}});

test('both grade-separated tunnels support a car from portal to portal',()=>{
  for(const tunnel of roadTunnels){
    const point=waypoints.find(p=>p.id===tunnel.id);
    let player=resolveTransport(spawn(), 'waypoint',point.id,0,terrain);
    assert.ok(player,tunnel.id+' approach');
    assert.equal(switchVehicle(player,terrain),null);
    player=switchVehicle(player,terrain,{...player,id:0});
    assert.ok(player?.vehicle,tunnel.id+' driving clearance');
    let low=player.y;
    for(let i=0;i<Math.ceil((tunnel.length/30+6)*10);i++){
      simulate(player,[[100,1,0,player.yaw,false]],terrain);
      low=Math.min(low,player.y);
      const [x,z]=tunnel.end;
      if(Math.hypot(player.x-x,player.z-z)<1.45)break;
    }
    assert.ok(low<tunnel.depth+.05,tunnel.id+' reaches the lower bore');
    assert.ok(Math.hypot(player.x-tunnel.end[0],player.z-tunnel.end[1])<2,tunnel.id+' exit');
    const middle=tunnelPoint(tunnel,tunnel.length*.5);
    assert.equal(tunnelSupport(...middle,tunnel.depth),tunnelFloor(tunnel,tunnel.length*.5));
    assert.equal(tunnelSupport(...middle,23),undefined);
    const wall=tunnelPoint(tunnel,tunnel.length*.5,tunnel.half);
    assert.equal(tunnelSupport(...wall,tunnel.depth),null);
  }
  const water=roadTunnels[1],above=tunnelPoint(water,204);
  assert.ok(waterLevel(...above)>water.depth+5);
});

test('the seven station loop boards only after arrival and moves every train to the next platform',()=>{
  assert.equal(stations.length,7);
  assert.ok(railwayMeters>14_000);
  const calledAt=1_700_000_000_000;
  for(const [i,station] of stations.entries()){
    const street=resolveTransport(spawn(),'waypoint','station-'+station.id,calledAt,terrain);
    assert.deepEqual([street.x,street.z],stationEntry(station));
    const platform=metroAction(street,'metro-enter',calledAt);
    assert.equal(platform.y,platformY);
    const calling=metroAction(platform,'metro-call',calledAt);
    assert.equal(trainState(calling.train,calledAt).phase,'approaching');
    assert.equal(metroAction(calling,'metro-board',calledAt+2000),null);
    const boarded=metroAction(calling,'metro-board',calledAt+8500);
    const leg=metroLegs[i];
    const during=trainState(boarded.train,calledAt+10500+leg.duration/2);
    assert.equal(during.phase,'riding');
    const pose=railPose(during.leg,during.distance);
    assert.ok(Math.hypot(pose.x-station.x,pose.z-station.z)>200);
    assert.equal(metroAction(boarded,'metro-leave',calledAt+10500+leg.duration/2),null);
    const arrived=metroAction(boarded,'metro-leave',calledAt+10500+leg.duration+20);
    assert.equal(arrived.station,stations[(i+1)%stations.length].id);
    assert.equal(arrived.train,null);
    assert.ok(resolveTransport(arrived,'metro-exit',null,calledAt,terrain));
  }
});

test('the airport departure rolls onto the runway before gaining altitude',()=>{
  const apron=planePose(0),taxi=planePose(11),roll=planePose(24),climb=planePose(35);
  assert.ok(taxi.z>apron.z&&roll.z===airport.runway[1]);
  assert.equal(roll.y,airport.elevation);
  assert.ok(climb.airborne&&climb.y>airport.elevation+20&&climb.x<roll.x-300);
  const stats=JSON.parse(readFileSync(new URL('./world/'+WORLD_VERSION+'/stats.json',base)));
  assert.equal(stats.buildings,0);
  for(const kind of ['avenue','collector','street','alley','gravel','sand'])assert.ok(stats.roadSurfaces[kind]>0);
});

test('all twelve park waypoints still arrive on dry ground',()=>{
  const parks=waypoints.filter(point=>point.id.startsWith('park-'));
  assert.equal(parks.length,12);
  for(const park of parks){
    const player=resolveTransport(spawn(),'waypoint',park.id,0,terrain);
    assert.ok(player,park.id);
    assert.ok(Number.isFinite(terrain.support(player.x,player.z)));
    assert.equal(terrain.water(player.x,player.z),null);
  }
});

test('rail graphics use textured triangles, with real boarding openings and no phantom bench collisions',()=>{
  const station=stations[0],leg=metroLegs[0];
  const trackside=metroBatches(station.x,station.z);
  assert.ok(trackside.length);
  assert.ok(trackside.every(batch=>batch.ranges.every(range=>range.kind==='tri')));
  const triangles=trackside.reduce((count,batch)=>count+batch.data.length/16,0);
  assert.ok(triangles<480);
  const collect=data=>new Set(Array.from({length:data.length/16},(_,i)=>data[i*16+15]));
  const places=new Set(trackside.flatMap(batch=>[...collect(batch.data)]));
  assert.deepEqual([...places].sort((a,b)=>a-b),Object.values(metroMaterial).slice(9));
  for(const phase of ['ready','running']){
    const meshes={};
    drawTrain(meshes,{leg,distance:0,phase});
    assert.deepEqual(Object.keys(meshes),['tri']);
    assert.ok(meshes.tri.length<210*16);
    const doors=meshes.tri.filter((value,index)=>index%16===15&&Math.floor(value)===metroMaterial.trainDoor);
    assert.equal(doors.length,phase==='ready'?40:48);
    assert.ok([...collect(meshes.tri)].every(mat=>mat>=METRO_MATERIAL_BASE&&mat<metroMaterial.track));
    for(const mat of Object.values(metroMaterial).slice(0,9)){
      assert.ok(collect(meshes.tri).has(mat));
      assert.ok(collect(meshes.tri).has(mat+TRAIN_VARIANT));
    }
    assert.deepEqual(metroUv(meshes.tri[12]),[0,0]);
  }
  const stopped={leg,distance:0,phase:'ready'};
  assert.equal(trainMeshes(stopped),trainMeshes({...stopped}));
  assert.notEqual(trainMeshes(stopped),trainMeshes({...stopped,phase:'departing'}));
  const floor=stationSupport(station.id,...stationPoint(station,.87,6.4));
  assert.equal(floor,platformY);
});
