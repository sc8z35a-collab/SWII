import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMission,missionSpawn} from '../dist/mission.js';
import {ASCENT_MS,EVACUATION_MS,FIRE_INTERVAL,launchSite,SURVIVAL_MS} from '../dist/mission-layout.js';
import {missionData} from '../dist/mission-data.js';
import {createVisibility} from '../dist/visibility.js';
import {playerVisibility} from '../dist/pursuit.js';
import {toTile} from '../dist/geography.js';
import {decodeTile,tilePath} from '../dist/tiles.js';
import {simulate,terrainSampler} from '../dist/physics.js';

const base=new URL('../dist/',import.meta.url),bytes=path=>Uint8Array.from(readFileSync(new URL(path,base)));
const files=new Map(),cache={at(x,z){
  const [a,b]=toTile(x,z),id=a+':'+b;
  if(!files.has(id))files.set(id,decodeTile(bytes(tilePath(a,b,false)).buffer,a,b,false));
  return files.get(id);
}};
const sight=createVisibility(async path=>new Response(bytes(path)),52);
const flat={support:()=>missionData.padFloor,terrainOccludes:()=>false};
const clear={blocked:()=>false},noSight={blocked:()=>true};
const books=Array.from({length:10},(_,i)=>i);
const playerAt=(x,z,y=missionData.padFloor)=>({...missionSpawn(),x,z,y});
function advance(mission,player,terrain,ms){
  for(let left=ms;left>0;left-=30)mission.update(player,player,terrain,Math.min(left,30));
}

test('all 30 baked books are distinct and standable and the first book persists',async ()=>{
  assert.equal(missionData.books.length,30);
  assert.equal(new Set(missionData.books.map(b=>b.x+':'+b.z)).size,30);
  const game=createMission(sight),terrain=terrainSampler(cache,game);
  for(const b of missionData.books)assert.ok(Number.isFinite(terrain.support(b.x,b.z,b.y)));
  const b=missionData.books[0],player=playerAt(b.x,b.z,b.y-.14);
  await sight.around(player.x,player.z,50);
  advance(game,player,terrain,120);
  assert.deepEqual(game.view().picked,[0]);
  assert.deepEqual(createMission(sight,game.save()).view().picked,[0]);
});

test('the torii requires ten books and real passage before starting the exact launch sequence',()=>{
  const {x,z}=launchSite.gate,a=playerAt(x,z+1),b=playerAt(x,z-1);
  let run=createMission(clear,{phase:'books',picked:books.slice(0,9)});
  run.update(a,b,flat,30);
  assert.equal(run.phase(),'books');
  run=createMission(clear,{phase:'books',picked:books});
  run.update({...a,x:x+7},{...b,x:x+7},flat,30);
  assert.equal(run.phase(),'books');
  run.update({...a,y:a.y-5},{...b,y:b.y-5},flat,30);
  assert.equal(run.phase(),'books');
  run.update(a,b,flat,30);
  assert.equal(run.phase(),'evacuate');
  assert.equal(run.view().enemies.length,0);
  advance(run,b,flat,EVACUATION_MS-1);
  assert.equal(run.view().lift,0);
  advance(run,b,flat,1);
  assert.equal(run.phase(),'ascent');
  advance(run,b,flat,ASCENT_MS/2);
  assert.equal(run.view().lift,350);
  assert.ok(Math.abs(b.y-(missionData.padFloor+350))<.001);
  advance(run,b,flat,ASCENT_MS/2);
  assert.equal(run.phase(),'survival');
  assert.equal(run.view().lift,700);
  assert.equal(launchSite.engines.length,8);
  const survivor=playerAt(x,z+200);
  const defended=createMission(noSight,{phase:'survival'});
  advance(defended,survivor,flat,FIRE_INTERVAL-1);
  assert.equal(defended.view().launches,0);
  advance(defended,survivor,flat,1);
  assert.equal(defended.view().launches,1);
  advance(defended,survivor,flat,FIRE_INTERVAL);
  assert.equal(defended.view().launches,2);
  advance(defended,survivor,flat,SURVIVAL_MS-FIRE_INTERVAL*2);
  assert.equal(defended.phase(),'escaped');
  assert.equal(defended.view().missiles.length,0);
});

test('on the built terrain the first two missiles hit an idle player and end the run',async ()=>{
  const run=createMission(sight,{phase:'survival'}),terrain=terrainSampler(cache,run);
  const player=missionSpawn();
  player.y=terrain.support(player.x,player.z);
  await sight.around(player.x,player.z,320);
  advance(run,player,terrain,18000);
  assert.equal(run.view().hp,2);
  assert.equal(run.view().launches,1);
  advance(run,player,terrain,10000);
  assert.equal(run.phase(),'lost');
  assert.equal(run.view().hp,0);
});

test('a real sprint down the street can evade the terminal dive',async ()=>{
  const run=createMission(sight,{phase:'survival'}),terrain=terrainSampler(cache,run);
  const player=missionSpawn();
  player.y=terrain.support(player.x,player.z);
  await sight.around(player.x,player.z,320);
  let sprint=false;
  for(let i=0;i<570;i++){
    const before={...player};
    if(run.missiles()[0]?.age>4000)sprint=true;
    if(sprint)simulate(player,[[1000/30,1,0,Math.PI,true]],terrain);
    run.update(before,player,terrain,1000/30);
  }
  assert.ok(player.z>1290);
  assert.equal(run.view().hp,4);
  assert.equal(run.view().launches,1);
});

test('vehicles can only be boarded nearby and a missile wreck empties one of four health bars',()=>{
  const car=missionData.cars[2],a=playerAt(car.x+2.1,car.z,car.y),b=playerAt(car.x+7,car.z,car.y);
  const ground={...flat,support:()=>car.y};
  const future=createMission(clear,{phase:'survival',time:1000});
  assert.equal(future.changeVehicle(b,ground),null);
  assert.equal(createMission(noSight).changeVehicle(a,ground),null);
  const onboard=future.changeVehicle(a,ground);
  assert.equal(onboard.vehicleId,car.id);
  const m={id:1,x:car.x,y:car.y+.83,z:car.z+2,direction:[0,0,-1],age:3000,track:[]};
  const run=createMission(clear,{phase:'survival',time:3000,launches:1,missiles:[m]});
  run.connect(onboard);
  advance(run,onboard,ground,30);
  assert.equal(run.view().hp,3);
  assert.equal(onboard.vehicle,false);
  assert.equal(run.view().cars.find(entry=>entry.id===car.id).wreck,true);
  assert.equal(run.changeVehicle(a,ground),null);
});

test('sight distinguishes partial cover from fully visible and unloaded sight data',()=>{
  const player=playerAt(10,1000,20),enemy={x:0,z:1000,y:20,scale:1};
  assert.equal(playerVisibility(enemy,player,flat,clear),'full');
  assert.equal(playerVisibility(enemy,player,flat,{blocked:(_,b)=>b[1]>21}),'partial');
  assert.equal(playerVisibility(enemy,player,flat,noSight),'none');
  assert.equal(playerVisibility(enemy,player,flat,{blocked:()=>null}),'unknown');
});
