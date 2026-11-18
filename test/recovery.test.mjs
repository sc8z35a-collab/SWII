import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {persistCheckpoint,positionKey,readCheckpoint} from '../dist/checkpoint.js';
import {WORLD_VERSION,toTile} from '../dist/geography.js';
import {createJourney} from '../dist/journey.js';
import {MAX_PHOTOS,PHOTO_PREFIX,photograph} from '../dist/photos.js';
import {progressKey,readProgress,writeProgress} from '../dist/progress.js';
import {mapImageSource} from '../dist/map-image.js';
import {PROTOCOL,spawn} from '../dist/physics.js';
import {createRegion} from '../dist/streaming.js';
import {tilePath} from '../dist/tiles.js';
import {withDeadline,withTabLock} from '../dist/network.js';
import {restoreJourney} from '../cloud/profile.js';

function replaceGlobal(t,name,value){
  const prior=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name];});
}

test('an unreadable new checkpoint falls back to the last valid coordinates',()=>{
  const player=spawn('paris');
  const stored=new Map([[positionKey,'{unfinished'],['atlantis.position.atlas-7',JSON.stringify({...player,city:'tokyo',yaw:8})]]);
  const load=()=>readCheckpoint({getItem:key=>stored.get(key)??null});
  assert.equal(load().city,'paris');
  assert.equal(load().x,player.x);
  assert.ok(Math.abs(load().yaw-Math.atan2(Math.sin(8),Math.cos(8)))<1e-8);
  stored.delete('atlantis.position.atlas-7');
  assert.equal(load(),null);
});

test('a stationary older tab preserves another tab’s new checkpoint and camera pitch',()=>{
  let value;
  const store={getItem:()=>value??null,setItem:(_key,next)=>{value=next;}};
  const original={...spawn('paris'),pitch:-.54};
  persistCheckpoint(store,null,original);
  const older=readCheckpoint(store);
  const updated={...spawn('sydney'),pitch:.82};
  persistCheckpoint(store,older,updated);
  persistCheckpoint(store,older,{...older,yaw:older.yaw+Math.PI*2});
  assert.equal(readCheckpoint(store).city,'sydney');
  assert.equal(readCheckpoint(store).pitch,.82);
  persistCheckpoint(store,updated,{...updated,pitch:-.74});
  assert.equal(readCheckpoint(store).pitch,-.74);
});

test('an old server profile recovers coordinates and valid stamps, even with missing motion fields',()=>{
  const position=spawn('paris');
  const saved=restoreJourney(JSON.stringify({world:'atlas-7',player:{x:position.x,z:position.z,yaw:12},
    time:'night',stamps:{paris:['seine','seine','missing'],rio:'beach'},traveled:45.3,revision:8}));
  assert.deepEqual(saved.player,{...position,yaw:Math.atan2(Math.sin(12),Math.cos(12))});
  assert.deepEqual(saved.stamps,{paris:['seine']});
  assert.equal(saved.traveled,45.3);
  assert.equal(saved.time,undefined);
  assert.equal(saved.revision,8);
  assert.equal(saved.dirty,true);
  const corrupt=restoreJourney('{truncated');
  assert.deepEqual(corrupt.player,spawn());
  assert.deepEqual(corrupt.stamps,{});
  assert.equal(corrupt.dirty,true);
});

test('a tile request can time out or follow cancellation using plain AbortController',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const parent=new AbortController();
  const hold=signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  const cancelled=assert.rejects(withDeadline(1000,hold,parent.signal),{name:'AbortError'});
  parent.abort();
  await cancelled;
  const timedOut=assert.rejects(withDeadline(1000,hold),{name:'TimeoutError'});
  t.mock.timers.tick(1000);
  await timedOut;
});

test('portrait photos keep their proportions and shrink further when JPEG bytes exceed the limit',t=>{
  const dimensions=[],valid=PHOTO_PREFIX+'YWJjZA==';
  const canvas={
    getContext:()=>({drawImage:(_source,_x,_y,w,h)=>dimensions.push([w,h])}),
    toDataURL:()=>dimensions.length===1?PHOTO_PREFIX+'A'.repeat(250_000):valid
  };
  replaceGlobal(t,'document',{createElement:()=>canvas});
  let image;
  photograph({width:1080,height:2400},value=>{image=value;});
  assert.equal(image,valid);
  assert.deepEqual(dimensions,[[405,900],[292,648]]);
});

test('an encoder exception resolves capture and the next shot still works',t=>{
  const calls=[],valid=PHOTO_PREFIX+'YWJjZA==';
  let failing=true;
  replaceGlobal(t,'document',{createElement:()=>({
    getContext:()=>({drawImage(){}}),
    toDataURL(){
      if(failing)throw Error('Canvas could not encode');
      return valid;
    }
  })});
  const source={width:640,height:480};
  photograph(source,image=>calls.push(image));failing=false;
  photograph(source,image=>calls.push(image));
  assert.deepEqual(calls,[null,valid]);
});

test('a storage failure leaves all old album entries intact',async ()=>{
  const original=Array.from({length:MAX_PHOTOS},(_,id)=>({id,image:PHOTO_PREFIX+'YWJjZA=='})),photo={...original[0],id:99};
  let value=JSON.stringify({photos:original});
  const store={getItem:()=>value,setItem(){throw Error('quota');}};
  const change=current=>({photos:[photo,...current.photos].slice(0,MAX_PHOTOS)});
  assert.equal(await writeProgress(store,change),null);
  assert.deepEqual(readProgress(store).photos,original);
  store.setItem=(_key,next)=>{value=next;};
  const saved=await writeProgress(store,change);
  assert.deepEqual(saved.photos[0],photo);
  assert.deepEqual(saved.photos.at(-1),original[MAX_PHOTOS-2]);
});

test('two tabs saving separate changes keep both the stamp and the photo',async ()=>{
  const entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  let queued=Promise.resolve();
  const locks={request(key,callback){assert.equal(key,progressKey);return queued=queued.then(callback);}};
  const writes=await Promise.all([
    writeProgress(storage,current=>({stamps:{...current.stamps,paris:['seine']}}),locks),
    writeProgress(storage,current=>({photos:[{city:'tokyo',image:PHOTO_PREFIX+'YWJjZA=='},...current.photos]}),locks),
    writeProgress(storage,()=>({shadows:false}),locks)
  ]);
  assert.ok(writes.every(Boolean));
  const saved=readProgress(storage);
  assert.deepEqual(saved.stamps.paris,['seine']);
  assert.equal(saved.photos[0].city,'tokyo');
  assert.equal(saved.shadows,false);
});

test('a map image retries after an error and redraws on recovery',t=>{
  const requests=[];
  class ImageStub extends EventTarget{set src(url){requests.push(url);}}
  replaceGlobal(t,'Image',ImageStub);
  t.mock.timers.enable({apis:['setTimeout']});
  let redraws=0,open=true;
  const layer=mapImageSource('./atlas.png',()=>redraws++,()=>open);
  layer.ensure();
  layer.image.dispatchEvent(new Event('error'));
  layer.ensure();
  assert.deepEqual(requests,['./atlas.png']);
  t.mock.timers.tick(700);
  assert.deepEqual(requests,['./atlas.png','./atlas.png?retry=1']);
  layer.image.dispatchEvent(new Event('error'));
  open=false;
  t.mock.timers.tick(1400);
  assert.equal(requests.length,2);
  open=true;layer.reopen();
  layer.image.dispatchEvent(new Event('load'));
  assert.equal(redraws,1);
  assert.equal(requests.at(-1),'./atlas.png?retry=2');
});

const assets=new URL('../dist/',import.meta.url);
async function fetchTile(path){
  if(path.includes('/architecture.json'))return Response.json({towers:[],skyline:{},pedestrians:[]});
  return new Response(await readFile(new URL(path,assets)));
}

test('a broken nearby tile does not prevent travel to a valid landing tile',async t=>{
  const {x,z}=spawn('rio'),[ix,iz]=toTile(x,z),landing=tilePath(ix,iz);
  const requested=[];
  replaceGlobal(t,'fetch',async path=>{
    requested.push(path);
    return path===landing||path.includes('/architecture.json')?fetchTile(path):new Response(null,{status:503});
  });
  const region=createRegion(),view=region.select(x,z,84);
  const arrived=await region.ready(x,z);
  assert.equal(arrived.ix,ix);
  assert.equal(arrived.iz,iz);
  assert.equal(requested.find(path=>path.endsWith('.bin')),landing);
  const neighbors=view.ids.filter(([a,b])=>a!==ix||b!==iz);
  const results=await Promise.allSettled(neighbors.map(([a,b])=>region.cache.get(a,b)));
  assert.ok(results.length>0&&results.every(result=>result.status==='rejected'));
});

test('returning to a scene immediately requeues an aborted tile',async t=>{
  const {x,z}=spawn('paris'),away=spawn('cairo'),[ix,iz]=toTile(x,z),landing=tilePath(ix,iz);
  const first=Promise.withResolvers(),second=Promise.withResolvers();
  let starts=0;
  replaceGlobal(t,'fetch',(path,options)=>{
    if(path===landing&&++starts===1)return new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
      first.resolve();
    });
    if(path===landing)second.resolve();
    return fetchTile(path);
  });
  const region=createRegion();
  region.select(x,z,10);
  await first.promise;
  region.select(away.x,away.z,10);
  region.select(x,z,10);
  await Promise.race([second.promise,new Promise((_resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('The tile was never requeued')),800);
    void second.promise.then(()=>clearTimeout(timer));
  })]);
  assert.equal((await region.cache.get(ix,iz)).iz,iz);
  assert.equal(starts,2);
});

test('failed worker startup decodes the downloaded landing tile without fetching it again',async t=>{
  const {x,z}=spawn('tokyo'),[ix,iz]=toTile(x,z),landing=tilePath(ix,iz);
  let downloads=0,workerAttempts=0;
  replaceGlobal(t,'Worker',class {
    postMessage(){
      workerAttempts++;
      queueMicrotask(()=>this.onerror());
    }
    terminate(){}
  });
  replaceGlobal(t,'fetch',path=>{
    if(path===landing)downloads++;
    return fetchTile(path);
  });
  const region=createRegion(),tile=await region.ready(x,z);
  assert.equal(tile.ix,ix);
  assert.equal(workerAttempts,1);
  assert.equal(downloads,1);
});

function journeyEnvironment(t,fetcher){
  const states=[],sockets=[];
  class Socket{
    static OPEN=1;
    readyState=1;
    bufferedAmount=0;
    sent=[];
    constructor(){sockets.push(this);}
    send(data){this.sent.push(data);}
    close(code){this.closeCode=code;this.readyState=3;this.onclose({code});}
    deliver(data){this.onmessage({data:JSON.stringify(data)});}
  }
  replaceGlobal(t,'document',{baseURI:'https://example.test/'});
  replaceGlobal(t,'localStorage',{getItem:()=>null,setItem(){}});
  replaceGlobal(t,'WebSocket',Socket);
  replaceGlobal(t,'fetch',async (url,options)=>{
    const override=fetcher?.(url,options);
    if(override)return override;
    return Response.json(url.pathname.endsWith('/health')?{service:'atlantis',world:WORLD_VERSION,protocol:PROTOCOL}:{});
  });
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  const ready={op:'ready',world:WORLD_VERSION,protocol:PROTOCOL,player:spawn()};
  return {states,sockets,ready,journey:createJourney(event=>states.push(event.mode??event.op))};
}
async function connectedJourney(t,upload){
  const environment=journeyEnvironment(t,(url,options)=>url.pathname.includes('/photos/')&&upload?.(url,options));
  const {journey,sockets,ready}=environment;
  await journey.start();
  sockets[0].deliver(ready);
  return environment;
}

test('a socket that stops acknowledging movement reconnects and starts from fresh state',async t=>{
  const {states,sockets,ready,journey}=await connectedJourney(t),[first]=sockets;
  assert.equal(journey.drive([[50,1,0,0,false]]),1);
  t.mock.timers.tick(4300);
  first.deliver({op:'state',seq:1,player:spawn()});
  t.mock.timers.tick(300);
  assert.equal(first.closeCode,undefined);
  assert.equal(journey.drive([[50,1,0,0,false]]),2);
  t.mock.timers.tick(4400);
  assert.equal(first.closeCode,4000);
  assert.equal(journey.mode,'waiting');
  await journey.start();
  sockets[1].deliver(ready);
  assert.equal(journey.mode,'cloud');
  assert.equal(journey.drive([[50,0,0,0,false]]),1);
  assert.deepEqual(states,['ready','cloud','state','waiting','ready','cloud']);
});

test('a late vehicle reply cannot move the player after the connection is retired',async t=>{
  const {states,sockets,ready,journey}=await connectedJourney(t),[first]=sockets;
  const rejected=assert.rejects(journey.action('vehicle',null),/timeout/);
  t.mock.timers.tick(5500);
  await rejected;
  assert.equal(journey.mode,'waiting');
  first.deliver({op:'action',id:1,player:spawn('rio')});
  assert.deepEqual(states,['ready','cloud','waiting']);
  await journey.start();
  sockets[1].deliver({...ready,player:spawn('rio')});
  assert.equal(journey.mode,'cloud');
});

test('malformed frames do not confirm movement or a new connection',async t=>{
  const {states,sockets,ready,journey}=await connectedJourney(t),[first]=sockets;
  first.deliver(null);
  assert.equal(journey.drive([[50,1,0,0,false]]),1);
  first.deliver({op:'state',seq:1,player:{x:2}});
  t.mock.timers.tick(4400);
  assert.equal(journey.mode,'waiting');
  await journey.start();
  sockets[1].deliver({...ready,player:null});
  assert.equal(journey.mode,'waiting');
  sockets[1].deliver(ready);
  assert.deepEqual(states,['ready','cloud','waiting','ready','cloud']);
});

test('a suspended page discards the old connection and reconnects only when restored',async t=>{
  const {sockets,ready,journey}=await connectedJourney(t);
  const first=journey.connectionId;
  const action=assert.rejects(journey.action('vehicle',null),/disconnected/);
  journey.suspend();
  await action;
  assert.equal(sockets[0].closeCode,1000);
  assert.equal(journey.connectionId,null);
  t.mock.timers.tick(30000);
  assert.equal(sockets.length,1);
  await journey.resume();
  sockets[1].deliver(ready);
  assert.notEqual(journey.connectionId,first);
  assert.equal(journey.mode,'cloud');
});

test('initial Cloudflare session cookies are established serially across tabs',async t=>{
  const request=Promise.withResolvers();
  let issued=0,tail=Promise.resolve();
  replaceGlobal(t,'navigator',{locks:{request(key,work){assert.equal(key,'atlantis.cloud.server');return tail=tail.then(work);}}});
  const {sockets,journey}=journeyEnvironment(t,url=>{
    if(!url.pathname.endsWith('/session'))return;
    issued++;
    return issued===1?request.promise:Response.json({});
  });
  const pending=[journey.start(),createJourney(()=>{}).start()];
  for(let i=0;i<12&&issued===0;i++)await Promise.resolve();
  assert.equal(issued,1);
  assert.equal(sockets.length,0);
  request.resolve(Response.json({}));
  await Promise.all(pending);
  assert.equal(issued,2);
  assert.equal(sockets.length,2);
});

test('malformed health replies retry without creating a local journey or claiming an update',async t=>{
  const {states,sockets,journey}=journeyEnvironment(t,()=>Response.json(null));
  await journey.start();
  assert.deepEqual(states,['waiting']);
  assert.equal(sockets.length,0);
});

test('a rejected browser lock falls back once, while a write error is never replayed',async()=>{
  let writes=0;
  const error=new DOMException('Lock unavailable','SecurityError');
  assert.equal(await withTabLock('test',()=>++writes,{request(){throw error;}}),1);
  await assert.rejects(withTabLock('test',()=>{writes++;throw error;},{request(_key,work){return work();}}),error);
  assert.equal(writes,2);
});

test('session rate limits delay automatic and online-triggered retries',async t=>{
  let sessions=0;
  const resumed=Promise.withResolvers();
  const {journey}=journeyEnvironment(t,url=>{
    if(!url.pathname.endsWith('/session'))return;
    if(++sessions===1)return Response.json({}, {status:429,headers:{'Retry-After':'60'}});
    resumed.resolve();
    return Response.json({});
  });
  await journey.start();
  assert.equal(journey.mode,'waiting');
  t.mock.timers.tick(58000);
  await journey.start();
  assert.equal(sessions,1);
  t.mock.timers.tick(4000);
  await resumed.promise;
  assert.equal(sessions,2);
});

test('returning to a backgrounded journey asks for a fresh heartbeat and movement confirmation',async t=>{
  const {sockets,journey}=await connectedJourney(t),socket=sockets[0];
  document.hidden=true;
  assert.equal(journey.drive([[50,0,0,0,false]]),1);
  t.mock.timers.tick(10000);
  assert.equal(socket.closeCode,undefined);
  document.hidden=false;
  journey.wake();
  assert.equal(socket.sent.at(-1),'ping');
  t.mock.timers.tick(4000);
  assert.equal(journey.connected,true);
  socket.deliver({op:'state',seq:1,player:spawn()});
  t.mock.timers.tick(1000);
  assert.equal(journey.connected,true);
});
