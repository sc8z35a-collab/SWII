import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createInterface} from 'node:readline';
import WebSocket from 'ws';
import {WORLD_VERSION,toTile} from '../dist/geography.js';
import {PROTOCOL,spawn as initial} from '../dist/physics.js';
import {tilePath} from '../dist/tiles.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const node=promisify(execFile);
async function runtime(dir){
  const child=spawn(join(root,'node_modules','workerd','bin','workerd'),['serve','--experimental','--control-fd','3','config.capnp'],{
    cwd:dir,stdio:['ignore','ignore','pipe','pipe']
  });
  let log='';
  child.stderr.on('data',chunk=>{log+=chunk;});
  const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  const ctl=createInterface({input:child.stdio[3]});
  let port;
  try{
    port=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('workerd did not start: '+log)),7000);
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
      child.once('exit',()=>{clearTimeout(timeout);reject(Error(log||'workerd exited'));});
      ctl.on('line',line=>{
        const data=JSON.parse(line);
        if(Number.isInteger(data.port)){clearTimeout(timeout);resolve(data.port);}
      });
    });
  }catch(error){child.kill();await exited;throw error;}
  return {base:'http://127.0.0.1:'+port,
    async stop(){
      ctl.close();child.kill();
      const force=setTimeout(()=>child.kill('SIGKILL'),900);
      try{await exited;}finally{clearTimeout(force);}
    }};
}
function channel(base,cookie){
  const ws=new WebSocket(base.replace('http:','ws:')+'/api/socket?p='+PROTOCOL+'&world='+WORLD_VERSION,{
    headers:{Origin:base,Cookie:cookie}
  });
  const data=[],waiters=new Set();
  let failure=null;
  function changed(){
    for(const check of waiters)check();
  }
  ws.on('message',text=>{const raw=text.toString();data.push(raw==='pong'?raw:JSON.parse(raw));changed();});
  ws.on('error',error=>{failure=error;changed();});
  ws.on('close',code=>{failure=Error('Socket closed: '+code);changed();});
  function next(pred){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiters.delete(check);reject(Error('No matching server message'));},5000);
      function check(){
        const i=data.findIndex(pred);
        if(i<0&&!failure)return;
        clearTimeout(timer);waiters.delete(check);
        if(i>=0)resolve(data.splice(i,1)[0]);else reject(failure);
      }
      waiters.add(check);check();
    });
  }
  return {ws,next,send(value){ws.send(typeof value==='string'?value:JSON.stringify(value));}};
}

test('Workers runtime owns movement, book collection, shooting, parked cars and save recovery',{timeout:45000},async ()=>{
  const dir=await mkdtemp(join(tmpdir(),'atlantis-worker-test-'));
  let worker,game,reopen;
  try{
    await mkdir(join(dir,'state'));
    await node(process.execPath,[join(root,'node_modules','wrangler','bin','wrangler.js'),'deploy','--dry-run','--outdir',dir],{
      cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:18000
    });
    await writeFile(join(dir,'config.capnp'),`using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "atlantis", worker = (
      modules = [(name = "index.js", esModule = embed "index.js")],
      compatibilityDate = "2026-11-09",
      bindings = [
        (name = "ASSETS", service = "assets"),
        (name = "JOURNEYS", durableObjectNamespace = (className = "Journey"))
      ],
      durableObjectNamespaces = [(className = "Journey", uniqueKey = "atlantis-integration-test", enableSql = true)],
      durableObjectStorage = (localDisk = "state")
    )),
    (name = "assets", disk = (path = ${JSON.stringify(join(root,'dist'))})),
    (name = "state", disk = (path = "state", writable = true))
  ],
  sockets = [(name = "http", address = "127.0.0.1:0", http = (), service = "atlantis")]
);
`);
    worker=await runtime(dir);
    let base=worker.base;
    const health=await (await fetch(base+'/api/health')).json();
    assert.equal(health.world,WORLD_VERSION);
    const start=initial(),path=tilePath(...toTile(start.x,start.z));
    assert.equal((await fetch(new URL(path,base))).status,200);
    assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://elsewhere.invalid'}})).status,403);
    const open=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base}});
    const cookie=open.headers.get('Set-Cookie').split(';')[0];
    assert.match(open.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await fetch(base+'/api/socket',{headers:{Cookie:cookie}})).status,426);
    const photoPath='/api/photos/00000000-0000-0000-0000-000000000000';
    assert.equal((await fetch(base+photoPath,{headers:{Cookie:cookie}})).status,404);
    game=channel(base,cookie);
    const ready=await game.next(x=>x.op==='ready');
    assert.equal(ready.started,false);
    assert.equal(ready.mission.phase,'books');
    assert.deepEqual(ready.mission.picked,[]);
    assert.equal(ready.mission.enemies.length,13);
    assert.deepEqual([ready.mission.gun.mag,ready.mission.gun.reserve],[120,130]);
    assert.equal(ready.player.city,'tokyo');
    game.send('ping');assert.equal(await game.next(x=>x==='pong'),'pong');
    for(const [i,kind] of ['discover','waypoint','travel','vehicle'].entries()){
      game.send({op:'action',id:i+1,kind,value:'crossing'});
      const response=await game.next(x=>x.op==='action'&&x.id===i+1);
      assert.equal(response.error,kind==='vehicle'?'transport':'action');
    }
    game.send({op:'drive',seq:1,samples:[[5,1000,0,0,false]],idle:false,x:1200,z:600});
    assert.equal((await game.next(x=>x.op==='state')).seq,0);
    for(let seq=1;seq<=12;seq++){
      await delay(98);
      game.send({op:'drive',seq,samples:[[95,-1,0,0,false]],idle:false});
      const active=await game.next(x=>x.op==='state'&&x.seq===seq);
      assert.ok(active.player.z>=start.z);
    }
    await delay(100);
    game.send({op:'drive',seq:13,samples:[[10,0,0,0,false]],idle:true});
    const saved=await game.next(x=>x.op==='state'&&x.seq===13);
    assert.ok(saved.player.z>start.z+5);
    assert.deepEqual(saved.mission.picked,[0]);
    await delay(90);game.send({op:'tick'});
    const idle=await game.next(x=>x.op==='state'&&x.seq===13);
    assert.ok(idle.mission.elapsed>saved.mission.elapsed);
    assert.equal(idle.player.z,saved.player.z);
    // The trigger is resolved on the server: three rounds leave the magazine at once.
    game.send({op:'fire',yaw:9,pitch:0});
    assert.equal((await game.next(x=>x.op==='error')).error,'packet');
    game.send({op:'fire',yaw:0,pitch:.4});
    const fired=await game.next(x=>x.op==='state'&&x.mission.gun.shots===1);
    assert.equal(fired.mission.gun.mag,117);
    assert.equal(fired.mission.bullets.length,3);
    game.send({op:'reload'});
    assert.ok((await game.next(x=>x.op==='state'&&x.mission.gun.reloading>0)).mission.gun.reloading<=1700);
    game.ws.close(1000);await delay(120);
    await worker.stop();worker=await runtime(dir);base=worker.base;
    reopen=channel(base,cookie);
    const resumed=await reopen.next(x=>x.op==='ready');
    assert.equal(resumed.player.z,saved.player.z);
    assert.deepEqual(resumed.mission.picked,[0]);
    assert.equal(resumed.mission.gun.mag+resumed.mission.gun.reserve,247);
    assert.equal(resumed.mission.enemies.length,13);
    assert.equal(resumed.started,true);
    assert.ok(resumed.mission.elapsed>=idle.mission.elapsed);
    const visitor=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base}});
    assert.notEqual(visitor.headers.get('Set-Cookie').split(';')[0],cookie);
  }finally{
    game?.ws.terminate();reopen?.ws.terminate();
    await worker?.stop();await rm(dir,{recursive:true,force:true});
  }
});
