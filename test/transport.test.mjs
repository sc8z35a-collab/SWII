import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_VERSION,toTile,waterLevel} from '../dist/geography.js';
import {decodeTile,tilePath} from '../dist/tiles.js';
import {simulate,spawn,terrainSampler} from '../dist/physics.js';
import {roadTunnels,tunnelFloor,tunnelPoint,tunnelSupport} from '../dist/road-tunnels.js';
import {metroLegs,metroAction,platformY,railPose,railwayMeters,stationEntry,stations,trainState} from '../dist/metro.js';
import {airport} from '../dist/transport-layout.js';
import {switchVehicle} from '../dist/driving.js';
import {planePose} from '../dist/moving-models.js';
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
  assert.equal(stats.linkedBuildings,stats.buildings);
  assert.equal(stats.civicSites.filter(site=>site.type==='construction').length,6);
  assert.ok(stats.civicSites.filter(site=>site.type==='parking').length>=12);
  for(const kind of ['avenue','collector','street','alley','gravel','sand'])assert.ok(stats.roadSurfaces[kind]>0);
});

test('all twelve city parks have ten distinct layouts and usable arrivals',()=>{
  const {civicSites}=JSON.parse(readFileSync(new URL('./world/'+WORLD_VERSION+'/stats.json',base)));
  const parks=civicSites.filter(site=>site.type==='park');
  assert.equal(parks.length,12);
  assert.equal(new Set(parks.map(park=>park.style)).size,10);
  assert.equal(new Set(parks.map(park=>park.city)).size,6);
  for(const park of parks){
    const id='park-'+park.city+'-'+park.style;
    const player=resolveTransport(spawn(),'waypoint',id,0,terrain);
    assert.ok(player,id+' entrance');
    assert.equal(player.city,park.city);
    assert.deepEqual([player.x,player.z],park.approach);
    const distance=Math.hypot(park.x-player.x,park.z-player.z)-park.depth*.5+2;
    const duration=Math.ceil(distance/6.8*10)+3;
    for(let i=0;i<duration;i++)simulate(player,[[100,1,0,player.yaw,false]],terrain);
    assert.ok(Math.hypot(park.x-player.x,park.z-player.z)<park.depth*.5,id+' park path');
  }
});
