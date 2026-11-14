import {WORLD_VERSION} from './geography.js';
import {PROTOCOL,cityById} from './physics.js';
import {withDeadline,withTabLock} from './network.js';

const api=path=>new URL('./api/'+path,document.baseURI);
const knownKey='atlantis.cloud.server';
const staticSite=Symbol('static site');
function remember(){
  try{localStorage.setItem(knownKey,'1');}catch{}
}
function known(){
  try{return localStorage.getItem(knownKey)==='1';}catch{return false;}
}
function validPlayer(player){
  return player&&cityById.has(player.city)&&
    [player.x,player.y,player.z,player.yaw,player.vx,player.vy,player.vz].every(Number.isFinite);
}
export function createJourney(notify){
  let mode='checking',connected=false,socket=null,attempt=0,timer=0,pings=0,handshake=0,seq=0,actionId=0;
  let ackTimer=0,acknowledged=0,probing=false;
  let suspended=false,generation=0,sessionNotBefore=0;
  let waitingForPong=null,lastPingCheck=0;
  const actions=new Map();
  function update(next){
    mode=next;connected=next==='cloud';notify({op:'connection',mode});
  }
  function stopTimers(){
    clearInterval(pings);clearTimeout(handshake);clearTimeout(ackTimer);ackTimer=0;
  }
  function clearActions(error){
    for(const item of actions.values()){clearTimeout(item.timer);item.reject(error);}
    actions.clear();
  }
  function retry(){
    clearTimeout(timer);
    if(suspended)return;
    const backoff=Math.min(12000,500*2**Math.min(attempt++,5))*(.9+Math.random()*.24);
    const delay=Math.max(backoff,sessionNotBefore-Date.now());
    timer=setTimeout(probe,delay);
  }
  function disconnected(next,code){
    if(socket!==next)return;
    socket=null;stopTimers();clearActions(Error('disconnected'));
    if(mode==='version')return;
    if(code===4001){update('replaced');return;}
    update('waiting');retry();
  }
  function reconnect(reason){
    const next=socket;
    if(!next)return;
    next.close(4000,reason);
    disconnected(next,4000);
  }
  async function probe(){
    if(probing||socket||suspended)return;
    if(Date.now()<sessionNotBefore){retry();return;}
    probing=true;
    clearTimeout(timer);
    try{
      const status=await withDeadline(5000,async signal=>{
        const health=await fetch(api('health'),{cache:'no-store',signal});
        const json=health.headers.get('Content-Type')?.includes('application/json');
        if(!known()&&(health.status===404||health.status===405||health.ok&&!json))return staticSite;
        if(!health.ok||!json)throw Error('Cloud service unavailable');
        return health.json();
      });
      if(suspended)return;
      if(status===staticSite){update('local');return;}
      if(status?.service!=='atlantis')throw Error('Invalid health response');
      if(status.protocol!==PROTOCOL||status.world!==WORLD_VERSION){update('version');return;}
      remember();
      const startSession=()=>withDeadline(5000,async signal=>{
        if(suspended)return;
        const response=await fetch(api('session'),{method:'POST',credentials:'same-origin',signal});
        if(response.status===429){
          const after=response.headers.get('Retry-After');
          const ms=after&&/^\d+$/.test(after)?Number(after)*1000:after?Date.parse(after)-Date.now():60000;
          sessionNotBefore=Date.now()+(Number.isFinite(ms)?Math.max(1000,Math.min(120000,ms)):60000);
        }
        if(!response.ok)throw Error('Session unavailable');
        sessionNotBefore=0;
      });
      await withTabLock(knownKey,startSession);
      if(suspended)return;
      openSocket();
    }catch{
      if(!suspended){update('waiting');retry();}
    }finally{probing=false;}
  }
  function watchMovement(){
    if(ackTimer||seq<=acknowledged)return;
    ackTimer=setTimeout(()=>{
      ackTimer=0;
      if(document.hidden){watchMovement();return;}
      reconnect('Movement confirmation timed out');
    },4400);
  }
  function ping(force=false){
    if(!connected||socket?.readyState!==WebSocket.OPEN||document.hidden)return;
    const now=performance.now();
    if(force||now-lastPingCheck>39000)waitingForPong=null;
    lastPingCheck=now;
    if(waitingForPong!==null&&now-waitingForPong>62000){reconnect('Ping timed out');return;}
    try{socket.send('ping');waitingForPong??=now;}
    catch{reconnect('Connection interrupted');}
  }
  function wake(){
    if(!connected)return;
    clearTimeout(ackTimer);ackTimer=0;watchMovement();
    ping(true);
  }
  function openSocket(){
    const url=api('socket');url.protocol=url.protocol==='https:'?'wss:':'ws:';
    url.searchParams.set('p',String(PROTOCOL));url.searchParams.set('world',WORLD_VERSION);
    const next=new WebSocket(url);socket=next;
    handshake=setTimeout(()=>next.close(),8500);
    next.onmessage=e=>{
      if(socket!==next)return;
      if(e.data==='pong'){waitingForPong=null;return;}
      let data;
      try{data=JSON.parse(e.data);}catch{return;}
      if(!data||typeof data!=='object')return;
      if(data.op==='ready'){
        if(data.protocol!==PROTOCOL||data.world!==WORLD_VERSION){update('version');next.close();return;}
        if(connected||!validPlayer(data.player))return;
        clearTimeout(handshake);attempt=0;seq=acknowledged=actionId=0;
        waitingForPong=null;lastPingCheck=performance.now();
        generation++;
        notify(data);update('cloud');
        pings=setInterval(ping,26000);
        return;
      }
      if(!connected||(['state','action'].includes(data.op)&&!validPlayer(data.player)))return;
      if(Number.isSafeInteger(data.seq)&&data.seq>acknowledged&&data.seq<=seq){
        acknowledged=data.seq;
        clearTimeout(ackTimer);ackTimer=0;watchMovement();
      }
      if(data.op==='action'){
        const item=actions.get(data.id);
        if(item){actions.delete(data.id);clearTimeout(item.timer);}
        notify(data);
        if(item){
          if(data.error)item.reject(Error(data.error));else item.resolve(data);
        }
      }else notify(data);
    };
    next.onerror=()=>{if(socket===next)reconnect('Connection interrupted');};
    next.onclose=e=>disconnected(next,e.code);
  }
  function send(data){
    if(!connected||socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>24_000)return false;
    try{socket.send(JSON.stringify(data));return true;}catch{return false;}
  }
  function drive(samples,idle=false){
    const n=seq+1;
    if(!send({op:'drive',seq:n,samples,idle}))return null;
    seq=n;watchMovement();return n;
  }
  function action(kind,value){
    const id=actionId+1;
    if(!send({op:'action',id,kind,value}))return Promise.reject(Error('disconnected'));
    actionId=id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        actions.delete(id);reject(Error('timeout'));
        reconnect('Command confirmation timed out');
      },5500);
      actions.set(id,{resolve,reject,timer});
    });
  }
  function suspend(){
    if(mode==='local'||mode==='replaced'||mode==='version')return;
    suspended=true;clearTimeout(timer);
    const next=socket;
    socket=null;stopTimers();clearActions(Error('disconnected'));
    next?.close(1000,'Page suspended');
    update('waiting');
  }
  function resume(){
    if(!suspended)return;
    suspended=false;
    return probe();
  }
  return {start:probe,suspend,resume,wake,drive,action,tick:()=>send({op:'tick'}),
    get mode(){return mode;},get connected(){return connected;},
    get connectionId(){return connected?generation:null;}};
}
