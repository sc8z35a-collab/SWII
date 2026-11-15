import {DurableObject} from 'cloudflare:workers';
import {WORLD_VERSION} from '../dist/geography.js';
import {decodeTile,tileCache,tilePath} from '../dist/tiles.js';
import {PROTOCOL,STEP_MS,MOVE_INTERVAL,MAX_BATCH_MS,terrainSampler,simulate,readInputs,idleDrive} from '../dist/physics.js';
import {json,trustedOrigin,cookieName,readToken,sessionCookie} from './http.js';
import {restorePlayer} from './profile.js';
import {playerFloor,resolveTransport,transportActions,transportDestination} from '../dist/transport.js';
import {createMission,missionSpawn,missionTerminal} from '../dist/mission.js';
import {createVisibility} from '../dist/visibility.js';
import {ACTIVE_RANGE} from '../dist/pursuit.js';

const CREDIT_LIMIT=270;
const SAVE_PERIOD=6000;
const MESSAGE_LIMIT=26;
const MAX_WIRE_BYTES=2048;
function journeyId(namespace,token){
  if(!token)return null;
  try{return namespace.idFromString(token);}catch{return null;}
}
async function quota(env,key){
  return !env.SESSION_GATE||(await env.SESSION_GATE.limit({key})).success;
}
function loadAsset(env,path){
  return env.ASSETS.fetch(new Request(new URL(path,'https://atlantis-assets.invalid/'))).then(response=>{
    if(!response.ok)throw Error('World asset unavailable');
    return response;
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(path!=='/api'&&!path.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(path==='/api/health'&&request.method==='GET'){
      return json({ok:true,service:'atlantis',protocol:PROTOCOL,world:WORLD_VERSION,stepMs:STEP_MS,batchMs:MOVE_INTERVAL});
    }
    const name=cookieName(url);
    if(!name||!trustedOrigin(request,url))return json({error:'origin'},403);
    if(path==='/api/session'&&request.method==='POST'){
      const current=journeyId(env.JOURNEYS,readToken(request,name));
      if(!current&&!await quota(env,'create:'+(request.headers.get('CF-Connecting-IP')??'local')))
        return json({error:'rate'},429,{'Retry-After':'60'});
      return json({protocol:PROTOCOL,world:WORLD_VERSION},200,
        {'Set-Cookie':sessionCookie(name,(current??env.JOURNEYS.newUniqueId()).toString())});
    }
    if(path!=='/api/socket'||request.method!=='GET')return json({error:'route'},404);
    const token=readToken(request,name),id=journeyId(env.JOURNEYS,token);
    if(!id)return json({error:'session'},401);
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'upgrade'},426);
    if(!trustedOrigin(request,url,true))return json({error:'origin'},403);
    if(url.searchParams.get('p')!==String(PROTOCOL)||url.searchParams.get('world')!==WORLD_VERSION)return json({error:'version'},409);
    if(!await quota(env,'socket:'+token))return json({error:'rate'},429,{'Retry-After':'60'});
    return env.JOURNEYS.get(id).fetch(request);
  }
};

export class Journey extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.ctx=ctx;
    this.jobs=Promise.resolve();
    this.tiles=tileCache(async (ix,iz)=>{
      const response=await loadAsset(env,tilePath(ix,iz,false));
      return decodeTile(await response.arrayBuffer(),ix,iz,false);
    },{capacity:56});
    this.sight=createVisibility(path=>loadAsset(env,path),56);
    this.terrain=terrainSampler(this.tiles,{
      plazaFloor:(...args)=>this.mission.plazaFloor(...args),
      carObstacle:(...args)=>this.mission.carObstacle(...args)
    });
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
    this.activeSocket=null;
    this.data=null;
    this.lastSave=0;
    this.dirty=false;
  }
  exclusive(fn){
    const job=this.jobs.then(fn);
    this.jobs=job.catch(()=>{});
    return job;
  }
  async prepare(player){
    // While creatures roam, the ground and the sight lines are needed as far as they are simulated.
    const tasks=[this.tiles.around(player.x,player.z,this.mission.occupied()?ACTIVE_RANGE+6:player.vehicle?18:8),
      this.sight.around(player.x,player.z,this.mission.occupied()?ACTIVE_RANGE+6:70)];
    for(const hunter of this.mission.hunters())
      tasks.push(this.tiles.around(hunter.x,hunter.z,40),this.sight.around(hunter.x,hunter.z,40));
    if(this.mission.occupied()){
      const spawn=missionSpawn();
      tasks.push(this.tiles.around(spawn.x,spawn.z,5));
    }
    for(const missile of this.mission.missiles()){
      if(missile.y<390){
        tasks.push(this.tiles.around(missile.x,missile.z,37),this.sight.around(missile.x,missile.z,37));
      }
    }
    await Promise.all(tasks);
  }
  async initialize(closingSocket=null){
    if(this.data)return;
    const row=this.sql.exec('SELECT value FROM profile WHERE id=1').toArray()[0];
    let saved;
    try{saved=JSON.parse(row?.value??'null');}catch{}
    const current=this.ctx.getWebSockets('game').find(ws=>ws.readyState===WebSocket.OPEN)??closingSocket;
    const attach=current?.deserializeAttachment();
    const valid=saved?.world===WORLD_VERSION&&saved?.mission;
    const before=valid?(restorePlayer(saved.player)??missionSpawn()):missionSpawn();
    const fromSocket=valid&&attach?.world===WORLD_VERSION&&attach.rev>saved.rev?restorePlayer(attach.player):null;
    const player=fromSocket??before;
    this.mission=createMission(this.sight,valid?saved.mission:null);
    this.mission.connect(player);
    this.activeSocket=current??null;
    await this.prepare(player);
    player.y=playerFloor(player,this.terrain)??player.y;
    player.vx=player.vy=player.vz=0;
    this.data={player,rev:fromSocket?attach.rev:valid?saved.rev??0:0,started:valid&&saved.started===true};
    this.dirty=!valid||Boolean(fromSocket);
  }
  persist(now=Date.now()){
    const mission=this.mission.save();
    this.sql.exec('INSERT INTO profile (id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      JSON.stringify({world:WORLD_VERSION,...this.data,mission}));
    this.lastSave=now;this.dirty=false;
  }
  snapshot(){
    return {...this.data,clock:Date.now(),mission:this.mission.view()};
  }
  send(ws,data){
    try{ws.send(JSON.stringify(data));}catch{}
  }
  saveAttachment(ws,attach){
    ws.serializeAttachment({...attach,player:this.data.player,rev:this.data.rev});
  }
  async fetch(request){
    if(new URL(request.url).pathname!=='/api/socket')return json({error:'route'},404);
    return this.exclusive(async ()=>{
      await this.initialize();
      const player=this.data.player;
      player.vx=player.vy=player.vz=0;
      if(this.dirty||!this.lastSave)this.persist();
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);
      const previous=this.ctx.getWebSockets('game');
      this.ctx.acceptWebSocket(server,['game']);
      this.activeSocket=server;
      for(const ws of previous)ws.close(4001,'Another tab opened this journey');
      const now=Date.now();
      this.saveAttachment(server,{world:WORLD_VERSION,seq:0,last:now,credit:100,window:now,count:0,action:0,simAt:now});
      this.send(server,{op:'ready',protocol:PROTOCOL,world:WORLD_VERSION,...this.snapshot()});
      return new Response(null,{status:101,webSocket:client});
    });
  }
  webSocketMessage(ws,wire){
    if(typeof wire!=='string'||wire.length>MAX_WIRE_BYTES){ws.close(1009,'Message too large');return;}
    let packet;
    try{packet=JSON.parse(wire);}catch{ws.close(1007,'Invalid message');return;}
    return this.exclusive(async ()=>{
      await this.initialize();
      if(ws!==this.activeSocket)return;
      const attach=ws.deserializeAttachment(),now=Date.now();
      if(attach?.world!==WORLD_VERSION){ws.close(1008,'Incompatible world');return;}
      if(now-attach.window>=1000){attach.window=now;attach.count=0;}
      if(++attach.count>MESSAGE_LIMIT){ws.close(1008,'Too many messages');return;}
      try{
        if(packet?.op==='drive')await this.drive(ws,packet,attach,now);
        else if(packet?.op==='tick')await this.tick(ws,attach,now);
        else if(packet?.op==='action')await this.action(ws,packet,attach,now);
        else if(packet?.op==='fire'||packet?.op==='reload')await this.weapon(ws,packet,attach,now);
        else this.send(ws,{op:'error',error:'packet'});
      }catch(error){
        console.error('Journey command failed',error instanceof Error?error.message:'unknown');
        if(packet?.op==='action'&&Number.isSafeInteger(packet.id))
          this.send(ws,{op:'action',id:packet.id,error:'temporary',seq:attach.seq,...this.snapshot()});
        else this.send(ws,{op:'error',error:'temporary'});
      }
      this.saveAttachment(ws,attach);
    }).catch(error=>{
      console.error('Journey event failed',error instanceof Error?error.message:'unknown');
      this.send(ws,{op:'error',error:'temporary'});
    });
  }
  step(before,attach,now){
    const interval=Math.max(0,now-attach.simAt),ms=interval<950?interval:100;
    const player=this.data.player,version=this.mission.version();
    attach.simAt=now;
    if(!missionTerminal(this.mission.phase())){
      for(let offset=0;offset<ms;offset+=30){
        this.mission.update(offset===0?before:player,player,this.terrain,Math.min(30,ms-offset));
      }
      if(!player.station){
        const ground=playerFloor(player,this.terrain);
        if(ground!==null&&player.y<ground)player.y=ground;
      }
      this.data.rev++;
      this.data.started=true;this.dirty=true;
      if(version!==this.mission.version()||now-this.lastSave>=SAVE_PERIOD)this.persist(now);
    }
  }
  async tick(ws,attach,now){
    if(now-attach.simAt<65)return;
    const player=this.data.player;
    await this.prepare(player);
    this.step({...player},attach,now);
    this.send(ws,{op:'state',seq:attach.seq,...this.snapshot()});
  }
  // The trigger and the reload are resolved here, from the confirmed position of the player.
  async weapon(ws,packet,attach,now){
    const player=this.data.player;
    if(missionTerminal(this.mission.phase()))return;
    if(packet.op==='fire'&&(!Number.isFinite(packet.yaw)||!Number.isFinite(packet.pitch)||
      Math.abs(packet.yaw)>Math.PI+.001||Math.abs(packet.pitch)>1.5)){
      this.send(ws,{op:'error',error:'packet'});return;
    }
    await this.prepare(player);
    this.step({...player},attach,now);
    if(packet.op==='fire')this.mission.shoot(player,packet.yaw,packet.pitch);
    else this.mission.reload();
    this.dirty=true;
    this.send(ws,{op:'state',seq:attach.seq,...this.snapshot()});
  }
  async drive(ws,packet,attach,now){
    const inputs=readInputs(packet.samples);
    if(!Number.isSafeInteger(packet.seq)||packet.seq<=attach.seq||packet.seq-attach.seq>32||!inputs||typeof packet.idle!=='boolean'){
      this.send(ws,{op:'state',seq:attach.seq,...this.snapshot()});return;
    }
    const player=this.data.player,before={...player};
    attach.credit=Math.min(CREDIT_LIMIT,attach.credit+Math.max(0,now-attach.last));
    attach.last=now;attach.seq=packet.seq;
    await this.prepare(player);
    if(!missionTerminal(this.mission.phase())){
      attach.credit=Math.max(0,attach.credit-simulate(player,inputs,this.terrain,Math.min(MAX_BATCH_MS,attach.credit)));
      if(idleDrive(packet.idle,inputs))player.vx=player.vz=0;
      this.step(before,attach,now);
    }
    this.send(ws,{op:'state',seq:attach.seq,...this.snapshot()});
  }
  async action(ws,packet,attach,now){
    if(!Number.isSafeInteger(packet.id)||packet.id<=attach.action||packet.id-attach.action>32)return;
    attach.action=packet.id;
    const respond=(error=null)=>this.send(ws,{op:'action',id:packet.id,error,seq:attach.seq,...this.snapshot()});
    const player=this.data.player;
    let next;
    if(packet.kind==='restart'&&missionTerminal(this.mission.phase())){
      next=missionSpawn();
      this.mission=createMission(this.sight);
      await this.prepare(next);
      next.y=playerFloor(next,this.terrain)??next.y;
    }else if(!missionTerminal(this.mission.phase())&&transportActions.has(packet.kind)){
      const target=transportDestination(player,packet.kind,packet.value);
      if(target)await this.tiles.around(...target.point,8);
      if(packet.kind==='vehicle'){
        await this.prepare(player);
        next=this.mission.changeVehicle(player,this.terrain);
      }else next=resolveTransport(player,packet.kind,null,now,this.terrain);
    }else{respond('action');return;}
    if(!next){respond('transport');return;}
    this.mission.connect(next);
    this.data.player=next;this.data.started=true;this.data.rev++;
    this.persist(now);respond();
  }
  webSocketClose(ws,code,reason){
    return this.exclusive(async ()=>{
      await this.initialize(ws);
      if(ws!==this.activeSocket)return;
      this.activeSocket=null;
      const player=this.data.player;
      player.vx=player.vy=player.vz=0;
      this.persist();
      try{ws.close(code,reason);}catch{}
    });
  }
  webSocketError(ws){
    return this.webSocketClose(ws,1011,'Connection interrupted');
  }
}
