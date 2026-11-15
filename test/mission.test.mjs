import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMission,missionSpawn} from '../dist/mission.js';
import {ASCENT_MS,EVACUATION_MS,FIRE_INTERVAL,launchSite,SURVIVAL_MS} from '../dist/mission-layout.js';
import {missionData} from '../dist/mission-data.js';
import {createVisibility} from '../dist/visibility.js';
import {createPursuit,enemyTypes,playerVisibility} from '../dist/pursuit.js';
import {RD2,stepBullet} from '../dist/ballistics.js';
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

test('all 80 baked books are distinct and standable and the first book persists',async ()=>{
  assert.equal(missionData.books.length,80);
  assert.equal(new Set(missionData.books.map(b=>b.x+':'+b.z)).size,80);
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

test('five pursuers, two giants and two of each face are scattered, see twice as far and run 1.3 times faster',()=>{
  const count=id=>enemyTypes.find(type=>type.id===id).count;
  assert.deepEqual(['pursuer','giant','hollow','skull','hannya'].map(count),[5,2,2,2,2]);
  const [pursuer,giant]=enemyTypes;
  assert.equal(pursuer.notice,140);assert.equal(giant.notice,176);
  assert.ok(Math.abs(pursuer.speed-18.5*1.3)<1e-9&&Math.abs(giant.speed-30*1.3)<1e-9);
  const origin=missionSpawn(),places=run=>run.view().map(e=>Math.round(e.x)+':'+Math.round(e.z));
  const first=createPursuit(clear,null,{origin}),second=createPursuit(clear,null,{origin});
  assert.equal(first.view().length,13);
  assert.equal(new Set(first.view().map(e=>e.id)).size,13);
  assert.ok(first.view().every(e=>Math.hypot(e.x-origin.x,e.z-origin.z)>150));
  assert.notDeepEqual(places(first),places(second));
  assert.deepEqual(places(createPursuit(clear,JSON.parse(JSON.stringify(first.save())),{origin})),places(first));
});

test('a creature follows the footprints of a player it cannot see, and twenty hits stun it for three minutes',()=>{
  const origin=missionSpawn(),walls={blocked:(a,b,padding)=>padding?false:true};
  let seed=7;
  const random=()=>(seed=seed*16807%2147483647)/2147483647;
  const hunt=createPursuit(walls,null,{origin,random}),start=hunt.view()[0];
  const player=playerAt(start.x+18,start.z-60,missionData.padFloor);
  let caught=null;
  for(let i=0;i<1300;i++){player.z+=.2;caught??=hunt.step(player,flat,30);}
  const tracker=hunt.view()[0];
  assert.equal(tracker.mode,'track');
  assert.equal(tracker.alerted,false);
  assert.ok(Math.hypot(tracker.x-player.x,tracker.z-player.z)<12);
  assert.equal(caught,null);
  const hit=hunt.struck([tracker.x-5,tracker.y+1,tracker.z],[tracker.x+5,tracker.y+1,tracker.z]);
  assert.equal(hit.actor.id,tracker.id);
  for(let i=1;i<RD2.stunHits;i++)assert.equal(hunt.wound(hit.actor,player).stunned,false);
  assert.equal(hunt.wound(hit.actor,player).stunned,true);
  assert.equal(hunt.view()[0].stun,180000);
  for(let ms=0;ms<179970;ms+=30)assert.equal(hunt.step(player,flat,30),null);
  assert.ok(hunt.view()[0].stun>0&&hunt.view()[0].x===tracker.x);
  hunt.step(player,flat,60);
  assert.equal(hunt.view()[0].stun,0);
});

test('RD II fires three rounds per pull from a 120 round magazine, reloads from 250 and gains 15 per pickup',()=>{
  // Every creature starts far away, so that none of them interrupts the shooting.
  const actors=Array.from({length:13},(_,i)=>({x:3000+i*50,z:2500,y:null,yaw:0,alerted:false,walked:0,waypoint:0,
    lastSeen:null,patrol:[[3000+i*50,2500]],stun:0,hits:0}));
  const run=createMission(clear,{phase:'books',pursuit:{v:2,actors}}),player=playerAt(launchSite.x+300,launchSite.z+300);
  assert.deepEqual([run.view().gun.mag,run.view().gun.reserve],[120,130]);
  assert.equal(run.shoot(player,0,0),3);
  assert.equal(run.view().bullets.length,3);
  assert.equal(run.shoot(player,0,0),0,'the pistol has to cycle');
  for(const bullet of run.view().bullets)assert.ok(Math.abs(Math.hypot(bullet.vx,bullet.vy,bullet.vz)-375)<.01);
  let pulls=1;
  for(let ms=0;ms<12000;ms+=30){
    if(run.view().gun.mag===0)break;
    if(run.shoot(player,0,.5))pulls++;
    run.update(player,player,flat,30);
  }
  assert.equal(pulls,40);
  assert.ok(run.view().gun.reloading>0);
  advance(run,player,flat,RD2.reloadMs);
  assert.deepEqual([run.view().gun.mag,run.view().gun.reserve],[120,10]);
  advance(run,player,flat,22000);
  const [drop]=run.view().drops;
  assert.ok(drop&&Math.hypot(drop.x-player.x,drop.z-player.z)<12.5);
  const reached={...player,x:drop.x,z:drop.z,y:drop.y},lying=run.view().drops.length;
  run.update(player,reached,flat,30);
  const taken=lying-run.view().drops.length;
  assert.ok(taken>=1);
  assert.equal(run.view().gun.reserve,10+15*taken);
  assert.equal(run.view().event.kind,'ammo');
  // Drag and gravity: the round is slower and lower after 100 m.
  const round={x:0,y:0,z:0,vx:375,vy:0,vz:0,age:0,travel:0};
  while(round.x<100)stepBullet(round,.01,()=>true);
  const speed=Math.hypot(round.vx,round.vy,round.vz);
  assert.ok(speed>300&&speed<330&&round.y<-.3&&round.y>-.6);
});
