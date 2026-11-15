import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {readProgress,settingDefaults} from '../dist/progress.js';
import {peopleMeshes} from '../dist/people.js';
import {missionLight} from '../dist/mission-scene.js';
import {drawCar,CAR_BRAKE,CAR_REVERSE} from '../dist/moving-models.js';
import {drawBirds} from '../dist/birds.js';
import {compileProgram} from '../dist/gl-program.js';
import {ARCHITECTURE_ASSET} from '../dist/architecture-materials.js';
import {WORLD_VERSION} from '../dist/geography.js';

const storage=value=>({getItem:()=>JSON.stringify(value)});

test('settings fall back to their defaults and keep valid choices',()=>{
  assert.deepEqual(Object.fromEntries(Object.keys(settingDefaults).map(k=>[k,readProgress(storage({}))[k]])),settingDefaults);
  const saved=readProgress(storage({fov:78,motionBlur:false,shake:false,invertY:true,showFps:true,volume:.35,mouseLock:true}));
  assert.equal(saved.fov,78);assert.equal(saved.motionBlur,false);assert.equal(saved.shake,false);
  assert.equal(saved.invertY,true);assert.equal(saved.showFps,true);assert.equal(saved.volume,.35);assert.equal(saved.mouseLock,true);
  const invalid=readProgress(storage({fov:120,motionBlur:'yes',volume:4,invertY:1}));
  assert.equal(invalid.fov,61);assert.equal(invalid.motionBlur,true);assert.equal(invalid.volume,.7);assert.equal(invalid.invertY,false);
});

test('nearby pedestrians turn their heads toward the player and keep out of the way',()=>{
  const path=[[0,0,0],[30,0,0]],people=[{id:3,path,speed:1.2,phase:.2}];
  let style=0;
  for(let t=0;t<3;t+=.25)style=peopleMeshes(people,12+t,[27,1.7,-2],null,true).humans[15];
  const code=(style>>10)&63,weight=(style>>16)&7;
  // Walking along +x with the viewer at -z, which is the walker's left: a positive turn.
  assert.ok(code>32&&weight===7,'look '+code+' weight '+weight);
  const far=peopleMeshes([{id:9,path,speed:1.2,phase:.2}],12,[15,1.7,40],null,true).humans;
  assert.equal((far[15]>>10)&63,0,'no turn when far away');
  // A person who would walk into the player is pushed to at least 1.2 m away.
  const pose=peopleMeshes([{id:5,path,speed:0,phase:.5}],0,[0,1.7,0],null,true).humans;
  const focus={x:pose[0]+.3,y:1.7,z:pose[2],radius:1.5};
  const moved=peopleMeshes([{id:5,path,speed:0,phase:.5}],0,[0,1.7,0],null,true,focus).humans;
  assert.ok(Math.hypot(moved[0]-focus.x,moved[2]-focus.z)>1.2);
});

test('explosions and the launch engines light the scene near the camera',()=>{
  assert.equal(missionLight({phase:'books',blasts:[]},[0,2,0],0),null);
  const flash=missionLight({phase:'survival',blasts:[{x:5,y:0,z:0,age:80}]},[0,2,0],0);
  assert.ok(flash.intensity>500&&flash.color.length===3);
  const faded=missionLight({phase:'survival',blasts:[{x:5,y:0,z:0,age:880}]},[0,2,0],0);
  assert.ok(!faded||faded.intensity<flash.intensity*.05);
  assert.equal(missionLight({phase:'survival',blasts:[{x:5000,y:0,z:0,age:80}]},[0,2,0],0),null);
});

test('the driven car carries its lights, steering and suspension in the instance',()=>{
  const meshes={detailed:true};
  drawCar(meshes,{x:0,y:0,z:0,yaw:0,paint:'2c4a6e'},0,.5,.3,{lights:CAR_BRAKE|CAR_REVERSE,bodyPitch:-.02,bodyRoll:.01});
  const car=meshes.cars;
  assert.equal(car[7],CAR_BRAKE|CAR_REVERSE);
  assert.equal(car[8],.3);assert.equal(car[9],-.02);assert.equal(car[10],.01);
  const wreck={detailed:true};
  drawCar(wreck,{x:0,y:0,z:0,yaw:0,wreck:true},0,0,0,{lights:CAR_BRAKE});
  assert.equal(wreck.cars[7],1,'a wreck shows no lights');
});

test('bird flocks appear around the viewer and nowhere far away',()=>{
  const ground=()=>12,near={},far={};
  drawBirds(near,[100,14,100],30,ground);
  drawBirds(far,[100,14,100],30,()=>undefined);
  assert.ok(near.tri?.length>0&&near.tri.length%16===0);
  assert.ok(!far.tri,'no birds over unloaded ground');
  for(let i=0;i<near.tri.length;i+=16){
    assert.ok(near.tri[i+1]>12+20,'birds fly above the roofs');
    assert.ok(Math.hypot(near.tri[i]-100,near.tri[i+2]-100)<240);
  }
  const again={};drawBirds(again,[100,14,100],30,ground);
  assert.deepEqual(again.tri,near.tri);
});

test('shader programs are compiled first and checked only when resolved',()=>{
  const calls=[];
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,LINK_STATUS:3,COMPILE_STATUS:4,ACTIVE_UNIFORMS:5,
    createProgram:()=>({}),createShader:type=>({type}),shaderSource(){},compileShader(){calls.push('compile');},
    attachShader(){},detachShader(){},deleteShader(){},deleteProgram(){},linkProgram(){calls.push('link');},
    getProgramParameter:(p,k)=>{calls.push('query');return k===3?false:0;},
    getShaderParameter:(sh,k)=>sh.type===1,getShaderInfoLog:()=>'ERROR: 0:2: bad token',getProgramInfoLog:()=>'link failed'};
  const program=compileProgram(gl,'void main(){}','line one\nline two\nline three');
  assert.deepEqual(calls,['compile','compile','link'],'nothing waits for the driver at creation');
  assert.throws(()=>program.resolve(),/bad token[\s\S]*2: line two/);
  assert.throws(()=>program.program,/bad token/,'the failure is kept');
});

test('the page preloads modules that exist and the current data files',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const modules=[...html.matchAll(/rel="modulepreload" href="\.\/([^"]+)"/g)].map(m=>m[1]);
  assert.ok(modules.length>10);
  for(const file of modules)assert.ok(existsSync(new URL('../dist/'+file,import.meta.url)),file);
  assert.ok(html.includes('href="./materials/'+ARCHITECTURE_ASSET+'"'));
  assert.ok(html.includes('href="./world/'+WORLD_VERSION+'/architecture.json"'));
});

test('sound calls are harmless where Web Audio is missing',async()=>{
  const {createAudio}=await import('../dist/audio.js');
  const audio=createAudio();
  audio.unlock();audio.setVolume(.35);audio.setPaused(true);audio.setPaused(false);
  audio.update({active:true,speed:12,vehicle:true,throttle:1,missile:40,thrust:.5,jet:.4,train:.6,trainRunning:true});
  audio.step(1.6);audio.pickup();audio.hit();audio.blast(120);audio.click();
  assert.equal(audio.started,false);
});
