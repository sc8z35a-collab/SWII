import {createRenderer,rad} from './engine.js';
import {cities,lighting,blendLighting} from './world.js';
import {districtAt,toGlobal,rawHeight,seascape} from './geography.js';
import {createRegion} from './streaming.js';
import {createJourney} from './journey.js';
import {MOVE_INTERVAL,MAX_BATCH_MS,LOOK_SPEED,cityById,terrainSampler,simulate,heading,clamp,frameInputs,idleDrive,keepCameraOutOfWalls} from './physics.js';
import {humanInstance,peopleMeshes} from './people.js';
import {sampleHeight,terrainWater} from './tiles.js';
import {clampPitch} from './checkpoint.js';
import {progressKey,readProgress,writeProgress} from './progress.js';
import {signalAt} from './street-lights.js';
import {loadArchitectureMaterials} from './architecture-materials.js';
import {airport,airportZone} from './transport-layout.js';
import {nearestStation,railPose,trainState} from './metro.js';
import {metroBatches,undergroundLight} from './metro-scene.js';
import {drawPlane,drawTrain,planePose} from './moving-models.js';
import {playerFloor,resolveTransport,transportDestination} from './transport.js';
import {createMission,missionPlazaFloor,missionSpawn,missionTerminal} from './mission.js';
import {ASCENT_MS,BOOK_TARGET,EVACUATION_MS,FIRE_INTERVAL,PLAYER_HEIGHT,SURVIVAL_MS,launchHeight,launchSite} from './mission-layout.js';
import {createVisibility} from './visibility.js';
import {drawMission,enemyGait,missionLight,requestLaunchAssembly,updateVehicleModel} from './mission-scene.js';
import {missionData} from './mission-data.js';
import {nearVehicle} from './driving.js';
import {drawBirds} from './birds.js';
import {createAudio} from './audio.js';
const $=id=>document.getElementById(id);
const hardwareScene=$('scene');
let scene=hardwareScene,rendererGeneration=0;
const stage=$('stage'), panel=$('panel'), panelBody=$('panelBody');
const look=$('look'),joystick=$('joystick'),stick=$('stick'),runButton=$('runBtn');
let save=readProgress();
try{save=readProgress(localStorage);}catch{}
const saveKey='atlantis.survival.v1';
let localRun=null;
try{
  const saved=JSON.parse(localStorage.getItem(saveKey));
  if(saved?.player&&saved?.mission&&[saved.player.x,saved.player.y,saved.player.z,saved.player.yaw].every(Number.isFinite))
    localRun=saved;
}catch{}
const sight=createVisibility(async path=>{
  const response=await fetch(path);
  if(!response.ok)throw Error('Visibility tile unavailable');
  return response;
});
const audio=createAudio();
audio.setVolume(save.volume);
$('fps').hidden=!save.showFps;
let mission=createMission(sight,localRun?.mission),missionView=mission.view(),previousView=null,viewSince=0;
let lastEvent=missionView.event?.id??0,damageAt=-Infinity,prefetchAt=0,cloudStarted=false,missionCatch=false;
let world,renderer,terrain,active=false,travelling=false,arrivalReady=false;
let arrivalBatch=null,moveTime=0;
let meshKey='',meshView,meshRevision=-1,meshRetryAt=0,hasMeshes=false;
let motion=missionSpawn(),position=[motion.x,motion.z],yaw=motion.yaw,pitch=0,bob=0,phase=0;
let toastTimer,frameTime=0,hudTime=0,startTime=0,lastLocalSave=0;
let nextFrame=0,nextWalker=0,walkers,autoScale=1,frameAverage=0,lastTuning=0,stableWindows=0;
let sceneLight,lightFrom,lightTarget,lightSince=0,lightCity;
let panelName='',running=false,lookPointer=null,movePointer=null,move=[0,0];
let confirmed=null,highestAck=0,correction=[0,0,0];
let unsent=[],outstanding=[],lastSend=0,wasMoving=false,lastHeading=0,lastHeartbeat=0;
let transitPending=false,viewOffset=0,flightStart=null,serverClock=0;
let shoreX=Infinity,shoreZ=Infinity;
const animationEpoch=(Date.now()-performance.now())/1000;
const coarsePointer=matchMedia('(pointer:coarse)'),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const keys=new Set();
let compassAngle=-1,driveInput={},shownHealth=-1,shownDamage=-1,stepDistance=0,travelTarget=null;
// Gamepad state: stick movement, held run/brake and edge-triggered buttons.
const pad={move:[0,0],run:false,buttons:[]};
const healthPips=[...$('health').querySelectorAll('i')];

const canMove=()=>journey.connected||journey.mode==='local';
const transitClock=()=>Date.now()+serverClock;
const watchingAirport=()=>airportZone(motion.x,motion.z,10)&&!motion.station;
function applyProgress(next){
  const qualityChanged=next.quality!==save.quality;
  save=next;
  if(qualityChanged){
    autoScale=1;frameAverage=0;stableWindows=0;
    renderer?.setQuality(save.quality);
  }
  audio.setVolume(save.volume);
  $('fps').hidden=!save.showFps;
  if(!save.mouseLock&&document.pointerLockElement)document.exitPointerLock?.();
  if(panelName==='settings')syncSettings();
}
async function saveProgress(change){
  let next,locks=null;
  try{locks=navigator.locks;}catch{}
  try{next=await writeProgress(localStorage,change,locks);}catch{}
  if(!next)return false;
  applyProgress(next);
  return true;
}
// Messages wait their turn instead of replacing one another; repeats are dropped. A running count
// (replace) updates the message on screen at once.
const toastQueue=[];
function toast(message,replace=false){
  const node=$('toast');
  if(!replace&&node.classList.contains('visible')&&node.textContent!==message){
    if(!toastQueue.includes(message)&&toastQueue.length<3)toastQueue.push(message);
    return;
  }
  showToast(message);
}
function showToast(message){
  const node=$('toast');
  clearTimeout(toastTimer);node.textContent=message;node.classList.add('visible');
  toastTimer=setTimeout(()=>{
    node.classList.remove('visible');
    if(toastQueue.length)toastTimer=setTimeout(()=>showToast(toastQueue.shift()),260);
  },toastQueue.length?1900:2850);
}
function updateStart(){
  $('startText').textContent=localRun||cloudStarted?'続きから':'ゲームを始める';
}
function prefetched(player,now){
  if(now<prefetchAt)return;
  prefetchAt=now+900;
  void sight.around(player.x,player.z,missionView.phase==='books'?128:72).catch(()=>{});
  if(missionView.phase==='books'){
    const spawn=missionSpawn();
    void world.ready(spawn.x,spawn.z).catch(()=>{});
  }
  for(const m of missionView.missiles??[])if(m.y<390)
    void sight.around(m.x,m.z,39).catch(()=>{});
}
function missionHud(view,now){
  const {phase,elapsed,hp,picked,missiles,enemies,event}=view;
  const title=$('missionTitle'),count=$('missionCount'),hint=$('missionHint'),hud=$('missionHud'),threat=$('threat');
  const fill=$('missionProgress'),countdown=Math.max(0,Math.ceil((SURVIVAL_MS-elapsed)/1000));
  const collected=picked.length,running=phase==='survival',terminal=missionTerminal(phase);
  hud.dataset.phase=phase;
  const set=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  if(phase==='books'){
    set(title,collected>=BOOK_TARGET?'鳥居をくぐる':'路上の本を探す');
    set(count,Math.min(collected,BOOK_TARGET)+' / '+BOOK_TARGET);
    set(hint,collected>=BOOK_TARGET?'塔の広場 正面の赤い鳥居':'本に近づくと拾えます');
    fill.style.width=Math.min(100,collected/BOOK_TARGET*100)+'%';
  }else if(phase==='evacuate'){
    set(title,'離陸前に退避');
    set(count,Math.max(0,Math.ceil((EVACUATION_MS-elapsed)/1000))+'秒');
    set(hint,'鳥居を出て、広場の外へ');fill.style.width=(1-clamp(elapsed/EVACUATION_MS,0,1))*100+'%';
  }else if(phase==='ascent'){
    set(title,'東京タワー上昇中');
    set(count,Math.round(view.lift)+' m');
    set(hint,'ゲルニカの攻撃に備える');fill.style.width=clamp(elapsed/ASCENT_MS,0,1)*100+'%';
  }else if(running){
    set(title,'ゲルニカから逃げ切る');
    set(count,Math.floor(countdown/60)+':'+String(countdown%60).padStart(2,'0'));
    set(hint,'次の発射まで '+Math.max(1,Math.ceil(((view.launches+1)*FIRE_INTERVAL-elapsed)/1000))+'秒');
    fill.style.width=countdown/600*100+'%';
  }
  $('health').hidden=!running;
  hud.hidden=terminal;
  if(hp!==shownHealth){
    shownHealth=hp;
    $('health').setAttribute('aria-label','耐久力 '+hp+' / 4');
    healthPips.forEach((part,i)=>part.classList.toggle('empty',i>=hp));
  }
  // The last point of durability: the screen edge pulses red.
  stage.classList.toggle('critical',running&&hp===1);
  const pursuers=enemies.filter(e=>e.alerted);
  const nearbyMissiles=missiles.filter(m=>Math.hypot(m.x-motion.x,m.z-motion.z,m.y-motion.y)<270);
  const warning=pursuers.length?'追跡されています':running&&nearbyMissiles.length?'ゲルニカ 接近':running&&missiles.length?'ゲルニカ 発射':'';
  threat.hidden=!warning||terminal;
  set(threat,warning);
  stage.dataset.warning=threat.hidden?'':nearbyMissiles.length?'missile':'danger';
  if(event&&event.id!==lastEvent){
    lastEvent=event.id;
    if(event.kind==='hit'||event.kind==='vehicleHit'||event.kind==='lost'){
      damageAt=now;
      if(coarsePointer.matches)try{navigator.vibrate?.([70,40,120]);}catch{}
    }
    if(event.kind==='caught'){
      toast(event.enemy+'に捕まりました。本の回収から続行できます');
      missionCatch=true;
    }
    if(event.kind==='purified')toast('敵が成仏しました。広場の外へ退避してください');
    if(event.kind==='vehicleHit')toast('車両が大破しました。徒歩で退避');
    if(event.kind==='book'){toast('本を拾った　'+event.total+' / 30',true);audio.pickup();}
    if(event.kind==='hit'||event.kind==='vehicleHit')audio.hit();
  }
  const result=$('missionResult'),wasHidden=result.hidden;
  result.hidden=!terminal||!active;
  if(terminal){
    result.dataset.outcome=phase;
    set($('missionResultTitle'),phase==='escaped'?'生還':'ゲームオーバー');
    set($('missionResultText'),phase==='escaped'?'ゲルニカの追跡から10分間逃げ切りました。':'耐久力が尽きました。');
    if(active&&wasHidden){releaseControls();writeCheckpoint();$('restart').focus();}
  }
}
function acceptMission(next,now){
  if(!next)return;
  if(next.phase!==missionView.phase)prefetchAt=0;
  previousView=missionView;missionView=next;viewSince=now;
  if(active&&(next.phase!==previousView.phase||missionView.event?.id!==lastEvent&&missionView.event))missionHud(next,now);
}
function renderedMission(now){
  if(missionTerminal(missionView.phase)){
    return {...missionView,blasts:missionView.blasts.map(blast=>({...blast,age:blast.age+now-viewSince})).filter(b=>b.age<2600)};
  }
  if(!journey.connected||!previousView)return missionView;
  const a=previousView,b=missionView,t=clamp((now-viewSince)/100,0,1);
  if(a.phase!==b.phase)return b;
  const between=(x,y)=>x+(y-x)*t,blend=(old,current)=>({...current,x:between(old.x,current.x),y:between(old.y,current.y),z:between(old.z,current.z)});
  const elapsed=between(a.elapsed,b.elapsed);
  return {...b,elapsed,lift:launchHeight(b.phase,elapsed),aim:a.aim+heading(b.aim-a.aim)*t,
    missiles:b.missiles.map(m=>{
      const old=a.missiles.find(p=>p.id===m.id);
      return old?{...blend(old,m),age:between(old.age,m.age)}:m;
    }),
    enemies:b.enemies.map(m=>{
      const old=a.enemies.find(p=>p.id===m.id);
      return old&&Number.isFinite(old.y)&&Number.isFinite(m.y)?{...blend(old,m),walked:between(old.walked,m.walked),
        yaw:old.yaw+heading(m.yaw-old.yaw)*t}:m;
    }),
    blasts:b.blasts.map(blast=>({...blast,age:blast.age+now-viewSince}))};
}
function setMotion(next,{reset=false}={}){
  const changed=Boolean(motion.vehicle)!==Boolean(next.vehicle)||motion.station!==next.station||
    Boolean(motion.train?.boardedAt)!==Boolean(next.train?.boardedAt);
  motion={...next};position=[motion.x,motion.z];
  if(reset||changed){
    yaw=lastHeading=motion.yaw;pitch=clampPitch(next.pitch);phase=0;bob=0;correction=[0,0,0];
    viewOffset=0;nextWalker=0;flightStart=null;
    if(motion.vehicle)pitch=-.12;
    if(motion.train?.boardedAt){viewOffset=.53;pitch=-.12;}
  }
}
function stream(x,z,now,landmark){
  if(!renderer)return;
  const cx=Math.round(x/96)*96,cz=Math.round(z/96)*96;
  const radius=renderer.software?240:save.quality==='low'?312:coarsePointer.matches&&save.quality!=='high'?344:435;
  const key=cx+','+cz+','+radius+','+save.quality+','+renderer.software+','+(landmark?'hero':'walk');
  if(key!==meshKey){
    meshKey=key;meshView=world.select(cx,cz,radius,x,z,landmark);meshRevision=-1;meshRetryAt=now+1500;
  }else if(now>=meshRetryAt){
    world.refresh(meshView);meshRetryAt=now+1500;
    if(!hasMeshes)toast('地形データを再読み込みしています');
  }
  if(meshRevision!==world.revision){
    const batches=world.batches(meshView);
    renderer.load(batches,renderer.software?139:save.quality==='low'?152:227,radius);
    hasMeshes=batches.length>0;meshRevision=world.revision;
  }
}
function flushDrive(idle=false){
  if(!journey.connected||!unsent.length||outstanding.length>=24)return false;
  const samples=unsent;
  const seq=journey.drive(samples,idle);
  if(seq===null)return false;
  outstanding.push({seq,samples,idle});unsent=[];lastSend=performance.now();
  return true;
}
function stopMotion(){
  if(!active||!terrain)return;
  if(journey.connected){
    if(!flushDrive())unsent=[];
    if(wasMoving||Math.hypot(motion.vx,motion.vz)>.05||Math.abs(heading(yaw-lastHeading))>.0005){
      const samples=[[1,0,0,heading(yaw),false]],seq=journey.drive(samples,true);
      if(seq!==null){outstanding.push({seq,samples,idle:true});lastHeading=yaw;}
    }
  }
  motion.vx=motion.vz=0;
  if(!motion.vehicle&&!motion.train?.boardedAt)motion.yaw=yaw;
  wasMoving=false;
}
function releaseControls(){
  stopMotion();keys.clear();moveTime=0;
  const lookId=lookPointer?.id,moveId=movePointer?.id;
  lookPointer=null;movePointer=null;move=[0,0];stick.style.transform='';
  if(lookId!==undefined&&look.hasPointerCapture(lookId))look.releasePointerCapture(lookId);
  if(moveId!==undefined&&joystick.hasPointerCapture(moveId))joystick.releasePointerCapture(moveId);
}
function setRunning(value){
  running=value;
  runButton.setAttribute('aria-pressed',String(value));
}
function changeActive(value){
  releaseControls();setRunning(false);
  if(!value&&document.pointerLockElement)document.exitPointerLock?.();
  void keepAwake(value);
  active=value;stage.classList.toggle('play',value);
  $('intro').hidden=value;$('hud').hidden=!value;
  if(value){missionHud(missionView,performance.now());updateTransport();}
  else $('missionResult').hidden=true;
}
function writeCheckpoint(){
  if(journey.mode!=='local'||!active)return;
  const player={...motion,vx:0,vy:0,vz:0,yaw:motion.vehicle||motion.train?.boardedAt?motion.yaw:heading(yaw),pitch};
  localRun={player,mission:mission.save()};
  try{localStorage.setItem(saveKey,JSON.stringify(localRun));}catch{}
  updateStart();
}
async function begin(){
  if(travelling||transitPending||!renderer||!world||!canMove())return;
  audio.unlock();
  if(panel.open)panel.close();
  releaseControls();
  travelling=true;arrivalReady=false;
  const connection=journey.connectionId;
  for(const node of [$('intro'),$('hud'),$('topBar'),$('service')])node.inert=true;
  $('travel').hidden=false;
  try{
    let target={...(journey.connected?confirmed:localRun?.player)??missionSpawn()};
    travelTarget=target;travelStage=0;travelShown=0;
    stream(target.x,target.z,performance.now());
    let tile=await world.ready(target.x,target.z);
    travelStage=1;
    await requestLaunchAssembly();
    travelStage=2;
    if(connection!==journey.connectionId)throw Error('disconnected');
    if(!journey.connected){
      mission.connect(target);
      if(playerFloor(target,terrain)===null&&(!missionView.lift||target.y<missionData.padFloor+2)){
        target=missionSpawn();
        mission.connect(target);
        stream(target.x,target.z,performance.now());
        tile=await world.ready(target.x,target.z);
      }
    }
    setMotion({...target,y:playerFloor(target,terrain)??target.y},{reset:true});
    prefetched(target,performance.now());
    meshRevision=-1;nextWalker=0;sceneLight=null;
    stream(target.x,target.z,performance.now());
    compass();hudTime=0;changeActive(true);
    writeCheckpoint();
    arrivalBatch=motion.station?null:tile.batch;arrivalReady=true;
  }catch(error){
    toast(error.message==='disconnected'?'接続が途切れました':'街を読み込めませんでした。もう一度お試しください');
  }finally{if(!arrivalReady)finishArrival();}
}
// Loading screen: the bar eases toward the next step of the arrival (the ground under the player,
// the tower assembly, the first rendered frame) and never passes a step that has not finished.
let travelStage=0,travelShown=0;
function travelProgress(){
  if(!travelTarget)return;
  const stage=arrivalReady?3:travelStage,goal=[.62,.84,.96,1][stage];
  travelShown=stage===3?1:travelShown+(goal-travelShown)*.045;
  const percent=Math.round(travelShown*100)+'%';
  if($('travelPercent').textContent!==percent){$('travelPercent').textContent=percent;$('travelBar').style.width=percent;}
}
function finishArrival(){
  $('travel').hidden=true;travelling=false;arrivalReady=false;arrivalBatch=null;travelTarget=null;
  $('travelPercent').textContent='0%';$('travelBar').style.width='0%';
  for(const node of [$('intro'),$('hud'),$('topBar'),$('service')])node.inert=false;
}
async function restart(){
  if(!canMove()||transitPending||!missionTerminal(missionView.phase))return;
  releaseControls();
  transitPending=true;$('restart').disabled=true;
  try{
    const next=missionSpawn();
    await world.ready(next.x,next.z);
    if(journey.connected)await journey.action('restart',null);
    else{
      mission=createMission(sight);
      lastEvent=0;acceptMission(mission.view(),performance.now());
      setMotion({...next,y:playerFloor(next,terrain)??next.y},{reset:true});
      writeCheckpoint();
    }
    damageAt=-Infinity;
  }catch{toast('再開できませんでした');}
  finally{transitPending=false;$('restart').disabled=false;}
}
function updateTransport(){
  const button=$('transportBtn'),surface=$('surfaceBtn'),status=$('transportStatus');
  const state=trainState(motion.train,transitClock());
  const station=motion.station?null:nearestStation(...position);
  let action='',label='',message='';
  if(motion.station){
    if(!state){action='metro-call';label='列車を呼ぶ';}
    else if(state.phase==='ready'){action='metro-board';label='列車に乗る';}
    else if(state.phase==='arrived'){action='metro-leave';label='列車を降りる';}
    message=state?.phase==='approaching'?'列車が接近中':motion.train?.boardedAt?
      (state?.phase==='arrived'?'駅に到着':'列車走行中'):'地下ホーム';
  }else if(station&&!motion.vehicle){
    action='metro-enter';label='地下鉄へ';message='地下鉄入口';
  }else if(watchingAirport()){
    action='flight';label=flightStart===null?'離陸を見る':'離陸を見直す';
    if(flightStart!==null){
      const elapsed=(performance.now()-flightStart)/1000;
      message=planePose(elapsed)?.airborne?'上昇中':elapsed>=19?'滑走路で加速中':'誘導路を移動中';
    }
  }
  if(motion.vehicle)message=Math.round(Math.hypot(motion.vx,motion.vz)*3.6)+' km/h';
  if(status.textContent!==message)status.textContent=message;
  if(button.textContent!==label)button.textContent=label;
  button.hidden=!action;button.dataset.action=action;button.disabled=transitPending;
  surface.hidden=!motion.station||Boolean(motion.train?.boardedAt);surface.disabled=transitPending;
  $('transportHud').hidden=!action&&!message;
  const possible=nearVehicle(motion,missionCars());
  const neighbor=possible&&sight.blocked([motion.x,motion.y+.9,motion.z],[possible.x,possible.y+1,possible.z])===false;
  $('vehicleBtn').hidden=Boolean(motion.station)||!motion.vehicle&&!neighbor;
  $('vehicleBtn').disabled=transitPending;
  const vehicleLabel=motion.vehicle?'車を降りる':'車に乗る',runLabel=motion.vehicle?'ブレーキ':'走る';
  if($('vehicleLabel').textContent!==vehicleLabel)$('vehicleLabel').textContent=vehicleLabel;
  if(runButton.textContent!==runLabel)runButton.textContent=runLabel;
  runButton.hidden=Boolean(motion.train?.boardedAt);
  const hint=motion.vehicle?'W・S 加速・後退 · A・D ハンドル · Shift ブレーキ':
    motion.train?.boardedAt?'ドラッグで車窓を見る':'WASD 移動 · ドラッグ 視点';
  if($('controlHint').textContent!==hint)$('controlHint').textContent=hint;
}

async function useTransport(kind){
  if(!kind||!active||travelling||transitPending||panel.open||!canMove()||missionTerminal(missionView.phase))return;
  if(kind==='flight'){
    if(watchingAirport()){flightStart=performance.now();nextWalker=0;}
    return;
  }
  if(kind==='vehicle'&&motion.vehicle&&Math.hypot(motion.vx,motion.vz)>1.35){
    toast('停車してから降りてください');return;
  }
  const target=transportDestination(motion,kind);
  releaseControls();setRunning(false);
  transitPending=true;updateTransport();
  try{
    if(target)await world.ready(...target.point);
    if(kind==='vehicle')await sight.around(motion.x,motion.z,8);
    const next=journey.connected?(await journey.action(kind,null)).player:kind==='vehicle'?
      mission.changeVehicle(motion,terrain):resolveTransport(motion,kind,null,Date.now(),terrain);
    if(!next)throw Error('transport');
    setMotion(next,{reset:kind!=='metro-call'});
    if(kind==='vehicle')audio.click();
    if(!journey.connected){mission.connect(next);acceptMission(mission.view(),performance.now());}
    writeCheckpoint();
  }catch{
    toast(kind==='vehicle'?'乗れる車の横まで近づいてください':kind==='metro-board'?'ホームの中央で列車に乗ってください':'移動できませんでした');
  }finally{transitPending=false;updateTransport();}
}
function compass(){
  const angle=(Math.round(yaw/rad)%360+360)%360;
  if(angle!==compassAngle){
    compassAngle=angle;
    const word=['N','NE','E','SE','S','SW','W','NW'][Math.round(angle/45)%8];
    $('compassText').textContent=word+' '+angle+'°';
  }
  compassGoal();
}
// Marks the direction of the next goal on the compass: the nearest book still on the street, then
// the torii gate once enough books are collected. Off-bar directions stick to the nearest edge.
let goalShown='';
function compassGoal(){
  let goal=null,label='';
  if(active&&!motion.station&&missionView.phase==='books'){
    const picked=new Set(missionView.picked);
    if(picked.size>=BOOK_TARGET){goal=launchSite.gate;label='鳥居';}
    else{
      let best=Infinity;
      for(const book of missionData.books){
        if(picked.has(book.id))continue;
        const d=Math.hypot(book.x-motion.x,book.z-motion.z);
        if(d<best){best=d;goal=book;}
      }
      label='本';
    }
  }
  const marker=$('compassTarget'),text=$('targetText');
  if(!goal){if(goalShown){goalShown='';marker.hidden=text.hidden=true;}return;}
  const distance=Math.hypot(goal.x-motion.x,goal.z-motion.z);
  const relative=heading(Math.atan2(goal.x-motion.x,motion.z-goal.z)-yaw);
  const offset=clamp(relative/(Math.PI/2),-1,1)*52;
  const shown=Math.round(offset)+':'+label+':'+Math.round(distance/5);
  if(shown===goalShown)return;
  goalShown=shown;
  marker.hidden=text.hidden=false;
  marker.style.setProperty('--target',offset.toFixed(1)+'px');
  marker.classList.toggle('edge',Math.abs(relative)>Math.PI/2);
  text.textContent=label+' '+(distance<1000?Math.round(distance/5)*5+' m':(distance/1000).toFixed(1)+' km');
}
function appendSample(sample){
  const total=unsent.reduce((n,row)=>n+row[0],0);
  if((total+sample[0]>MAX_BATCH_MS||unsent.length>=8)&&!flushDrive()){
    // In a congested connection, cap speculation until the next confirmed snapshot.
    return false;
  }
  unsent.push(sample);
  return true;
}
function travelMove(dt,now,missionMs){
  const f=clamp((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-move[1]-pad.move[1],-1,1);
  let s=clamp((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+move[0]+pad.move[0],-1,1);
  const rotation=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
  if(motion.vehicle)s=clamp(s+rotation,-1,1);
  else if(rotation)yaw=heading(yaw+rotation*dt*LOOK_SPEED);
  driveInput={throttle:f,steer:s,brake:running||keys.has('ShiftLeft')||keys.has('ShiftRight')||pad.run};
  if(!canMove()||missionTerminal(missionView.phase))return;
  if(Math.hypot(f,s)>.01)flightStart=null;
  const walking=Math.hypot(f,s)>.001,coasting=Math.hypot(motion.vx,motion.vy,motion.vz)>.012;
  const orient=!motion.vehicle&&Math.abs(heading(yaw-lastHeading))>.052;
  const before={...motion},beforeX=motion.x,beforeZ=motion.z;
  if(!motion.train?.boardedAt&&(walking||coasting||orient)){
    const inputs=frameInputs(dt*1000,Math.round(f*1000)/1000,Math.round(s*1000)/1000,
      heading(Math.round(yaw*10000)/10000),running||keys.has('ShiftLeft')||keys.has('ShiftRight')||pad.run);
    for(const input of inputs){
      if(journey.connected&&(outstanding.length>=18||!appendSample(input)))break;
      simulate(motion,[input],terrain);
      lastHeading=yaw;
    }
  }
  prefetched(motion,now);
  if(journey.mode==='local'){
    const seq=mission.version();
    for(let offset=0;offset<missionMs;offset+=30)
      mission.update(offset===0?before:motion,motion,terrain,Math.min(30,missionMs-offset));
    const next=mission.view();
    acceptMission(next,now);
    if(mission.version()!==seq)writeCheckpoint();
    const ground=playerFloor(motion,terrain);
    if(ground!==null&&ground>motion.y)motion.y=ground;
    if(missionCatch){missionCatch=false;setMotion(motion,{reset:true});}
  }
  const stopped=wasMoving&&!walking&&!coasting;
  if(journey.connected&&stopped&&!unsent.length)appendSample([1,0,0,heading(yaw),false]);
  if(journey.connected&&unsent.length&&(now-lastSend>=MOVE_INTERVAL||stopped))flushDrive(!walking&&!coasting);
  if(journey.mode==='local'&&(walking&&now-lastLocalSave>6200||wasMoving&&!walking&&!coasting)){
    writeCheckpoint();lastLocalSave=now;
  }
  if(journey.connected&&now-lastHeartbeat>=105&&now-lastSend>100){
    journey.tick();lastHeartbeat=now;
  }
  wasMoving=walking||coasting;
  position[0]=motion.x;position[1]=motion.z;
  const moved=Math.hypot(motion.x-beforeX,motion.z-beforeZ);
  if(!motion.vehicle&&!motion.train?.boardedAt){
    const sprint=running||keys.has('ShiftLeft')||keys.has('ShiftRight')||pad.run,stride=sprint?1.15:.72;
    stepDistance=moved>0?stepDistance+moved:0;
    if(stepDistance>=stride){stepDistance%=stride;audio.step(sprint?1.6:1);}
  }
  phase=(phase+moved*2.3)%(2*Math.PI);
  const speed=moved/Math.max(dt,.0001);
  if(motion.vehicle||motion.station||reduceMotion.matches)bob=0;
  else bob+=(Math.sin(phase)*Math.min(1,speed/4.8)*.035-bob)*(1-Math.exp(-dt*10));
}
function advanceMotion(now){
  if(!renderer||!active||travelling||transitPending||panel.open||!canMove())return;
  if(moveTime&&now>moveTime){
    const elapsed=now-moveTime;
    travelMove(Math.min(MAX_BATCH_MS,elapsed)/1000,now,Math.min(950,elapsed));
  }
  moveTime=Math.max(now,moveTime);
}
function applySnapshot(data){
  if(!data.player)return;
  if(Number.isFinite(data.clock))serverClock=data.clock-Date.now();
  confirmed={...data.player};cloudStarted=data.started===true;
  if(data.op==='ready')lastEvent=data.mission?.event?.id??0;
  acceptMission(data.mission,performance.now());
  if(data.op==='ready'){
    highestAck=0;outstanding=[];unsent=[];wasMoving=false;
    if(active&&!travelling&&!world.cache.at(confirmed.x,confirmed.z)){
      queueMicrotask(()=>{if(journey.connected&&!travelling)void begin();});
      return;
    }
    setMotion(confirmed,{reset:true});updateStart();compass();
    return;
  }
  if(Number.isInteger(data.seq)&&data.seq>=highestAck){
    highestAck=data.seq;
    outstanding=outstanding.filter(item=>item.seq>highestAck);
    const predicted={...confirmed};
    for(const item of outstanding){
      simulate(predicted,item.samples,terrain);
      if(idleDrive(item.idle,item.samples)){
        predicted.vx=predicted.vz=0;
      }
    }
    if(unsent.length)simulate(predicted,unsent,terrain);
    const dx=motion.x-predicted.x,dy=motion.y-predicted.y,dz=motion.z-predicted.z;
    if(Math.hypot(dx,dy,dz)<4&&!missionCatch){
      correction=[clamp(correction[0]+dx,-2,2),clamp(correction[1]+dy,-1,1),clamp(correction[2]+dz,-2,2)];
    }else correction=[0,0,0];
    setMotion(predicted,{reset:missionCatch});missionCatch=false;
  }

}
function onJourney(event){
  if(event.op!=='connection'){
    if(event.op!=='error')applySnapshot(event);
    return;
  }
  const mode=event.mode;
  $('serviceLabel').textContent={
    local:'ブラウザ版',cloud:'Cloudflare 接続済み',waiting:'サーバーに再接続中',replaced:'別のタブで旅を再開中',version:'更新が必要です'
  }[mode]??'接続を確認中';
  $('service').dataset.mode=mode;
  $('cloudRetry').hidden=!['replaced','version','waiting'].includes(mode);
  if(['waiting','replaced','version'].includes(mode)){
    releaseControls();unsent=[];outstanding=[];
    if(confirmed)setMotion(confirmed);
  }
  if(mode==='local'||mode==='cloud')updateStart();
  updateStartButton();
}
// Starting needs both a connection mode and a renderer; the shaders may still be compiling.
function updateStartButton(){
  $('start').disabled=!['local','cloud'].includes(journey?.mode)||!renderer;
}
const journey=createJourney(onJourney);
function tuneScale(now,interval,target){
  if(save.quality!=='auto')return;
  frameAverage=frameAverage?frameAverage*.94+Math.min(interval,90)*.06:target;
  if(now-lastTuning<1450)return;
  lastTuning=now;
  let scale=autoScale;
  if(frameAverage>target*1.34){scale=Math.max(.68,scale-.10);stableWindows=0;}
  else if(frameAverage<target*1.11){
    if(++stableWindows>=3){scale=Math.min(1,scale+.05);stableWindows=0;}
  }else stableWindows=0;
  if(scale!==autoScale){autoScale=scale;renderer.setAutoScale(scale);}
}

function cityLighting(now,x,z){
  const city=cityById.get(districtAt(x,z));
  if(!sceneLight||lightCity!==city||Math.hypot(x-shoreX,z-shoreZ)>65){
    shoreX=x;shoreZ=z;
    lightTarget={...lighting(city),...seascape(x,z)};lightFrom=sceneLight??lightTarget;
    lightCity=city;lightSince=now;
  }
  const progress=clamp((now-lightSince)/1050,0,1);
  sceneLight=progress===1||reduceMotion.matches||lightFrom===lightTarget?lightTarget:blendLighting(lightFrom,lightTarget,progress);
  return sceneLight;
}
function followCar(player){
  const s=Math.sin(player.yaw),c=Math.cos(player.yaw);
  let distance=5.1,level=player.y;
  for(let i=.5;i<=5.1;i+=.5){
    const floor=terrain.support(player.x-s*i,player.z+c*i,player.y);
    if(floor===null||floor>player.y+.85){distance=Math.max(0,i-.67);break;}
    level=floor;
  }
  return [player.x-s*distance,Math.max(player.y,level)+Math.min(2.66,1.65+distance*.22),player.z+c*distance];
}

// Sound for this frame: the continuous layers follow the scene and each new explosion is heard
// once, delayed by its distance.
const heardBlasts=new Set();
let flightSeconds=0;
function listen(view,eye,speed,flight,train){
  if(!audio.started)return;
  // Engines idle while the airliner taxis, spool up on the runway after 19 s and stay at full power.
  let jet=0;
  if(flight){
    const power=flightSeconds<19?.22:Math.min(1,.22+(flightSeconds-19)/9);
    jet=power*clamp(1-Math.hypot(flight.x-eye[0],flight.y-eye[1],flight.z-eye[2])/1300,0,1)**2;
  }
  const trainLevel=!train?0:{approaching:.25+.75*clamp(1-(train.leg.length-train.distance)/136,0,1),ready:.12,departing:.3,riding:.75,arrived:.12}[train.phase]??0;
  let missile=Infinity,thrust=0;
  for(const m of view.missiles??[])missile=Math.min(missile,Math.hypot(m.x-eye[0],m.y-eye[1],m.z-eye[2]));
  if(active&&(view.phase==='evacuate'||view.phase==='ascent')){
    const spool=view.phase==='ascent'?1:clamp((view.elapsed-EVACUATION_MS+3600)/3600,0,1);
    thrust=spool*clamp(1-Math.hypot(eye[0]-launchSite.x,eye[2]-launchSite.z)/700,0,1);
  }
  for(const blast of view.blasts??[]){
    if(heardBlasts.has(blast.id))continue;
    heardBlasts.add(blast.id);
    if(heardBlasts.size>64)heardBlasts.delete(heardBlasts.values().next().value);
    if(active&&blast.age<400)audio.blast(Math.hypot(blast.x-eye[0],blast.y-eye[1],blast.z-eye[2]));
  }
  const ground=visualGround(eye[0],eye[2]);
  audio.update({active,underground:active&&Boolean(motion.station),speed,vehicle:active&&motion.vehicle,
    throttle:driveInput.throttle??0,missile,thrust,altitude:Number.isFinite(ground)?eye[1]-ground:0,
    jet,train:trainLevel,trainRunning:train?.phase==='riding'});
}
// Frame rate readout for the settings toggle, refreshed twice a second.
let fpsFrames=0,fpsSince=0;
function countFrame(now){
  if(!save.showFps)return;
  fpsFrames++;
  if(now-fpsSince<500)return;
  const fps=fpsFrames*1000/(now-fpsSince);
  if(fpsSince)$('fps').textContent=(fps<10?fps.toFixed(1):Math.round(fps))+' fps';
  fpsFrames=0;fpsSince=now;
}
// Standard gamepads: left stick moves or steers, right stick looks, A runs or brakes,
// B gets in and out of cars, X uses the transport button and Start opens the settings.
// Polling starts once a pad has announced itself, so pages without one never pay for it.
let gamepadSeen=false;
window.addEventListener('gamepadconnected',e=>{
  gamepadSeen=true;
  if(e.gamepad?.mapping==='standard')toast('ゲームパッドを接続しました');
});
// Keeps a phone's screen awake while playing; the browser drops the lock when the page is hidden.
let wakeLock=null;
async function keepAwake(on){
  try{
    if(on&&!wakeLock&&!document.hidden&&navigator.wakeLock){
      wakeLock=await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release',()=>{wakeLock=null;});
    }else if(!on&&wakeLock){const lock=wakeLock;wakeLock=null;await lock.release();}
  }catch{wakeLock=null;}
}
function pollGamepad(dt){
  if(!gamepadSeen)return;
  let gamepad=null;
  try{for(const g of navigator.getGamepads?.()??[])if(g?.connected&&g.mapping==='standard'){gamepad=g;break;}}catch{}
  if(!gamepad){if(pad.run||pad.move[0]||pad.move[1]){pad.move=[0,0];pad.run=false;}return;}
  const dead=v=>Math.abs(v)<.16?0:(v-Math.sign(v)*.16)/.84;
  const [lx,ly,rx,ry]=[0,1,2,3].map(i=>dead(gamepad.axes[i]??0));
  const pressed=i=>Boolean(gamepad.buttons[i]?.pressed);
  const usable=active&&!travelling&&!panel.open&&canMove()&&!missionTerminal(missionView.phase);
  const next=usable?[lx,ly]:[0,0];
  if((Math.hypot(...next)>0)!==(Math.hypot(...pad.move)>0)||pressed(0)!==pad.run)advanceMotion(performance.now());
  pad.move=next;pad.run=usable&&pressed(0);
  if(usable&&(rx||ry)){
    const gain=2.4*save.sensitivity*dt;
    flightStart=null;
    if(motion.vehicle)viewOffset=clamp(viewOffset+rx*gain,-.93,.93);
    else if(motion.train?.boardedAt)viewOffset=heading(viewOffset+rx*gain);
    else yaw=heading(yaw+rx*gain);
    pitch=clampPitch(pitch-ry*gain*.75*(save.invertY?-1:1));
  }
  const edge=i=>{const now=pressed(i),was=pad.buttons[i];pad.buttons[i]=now;return now&&!was;};
  if(edge(1)&&usable)void useTransport('vehicle');
  if(edge(2)&&usable)void useTransport($('transportBtn').hidden?null:$('transportBtn').dataset.action);
  if(edge(9)){if(panel.open)panel.close();else if(active)openPanel();else void begin();}
}
// The player's own body is drawn only into the shadow map, so a shadow walks along with them.
let bodyPhase=0,bodyTime=null;
function playerShadow(out,now){
  const speed=Math.hypot(motion.vx,motion.vz),dt=bodyTime===null?0:Math.min(.25,(now-bodyTime)/1000);
  bodyTime=now;
  const stride=speed>3.2?2.3:1.42;
  bodyPhase=(bodyPhase+speed*dt/stride*Math.PI*2)%(Math.PI*2);
  humanInstance(out.shadowHumans??=[],{x:motion.x,y:motion.y,z:motion.z,yaw:speed>.3?Math.atan2(motion.vx,-motion.vz):yaw,
    scale:1,build:1,phase:bodyPhase,gait:clamp(speed/1.4,0,1),stride,
    skin:'c8a080',hair:'2a2420',top:'3b4a5c',bottom:'2b3446',shoe:'1c1c1e',style:0});
}
// Camera shake from the launch, nearby explosions and the giant's footsteps.
function cameraShake(view,eye){
  if(reduceMotion.matches||!save.shake)return 0;
  let shake=0;
  if(view.phase==='ascent'&&view.lift<128)
    shake=(1-view.lift/128)*Math.max(0,1-Math.hypot(motion.x-launchSite.x,motion.z-launchSite.z)/160);
  for(const blast of view.blasts??[]){
    const t=blast.age/1000;
    if(t>1.2)continue;
    const d=Math.hypot(blast.x-eye[0],blast.y-eye[1],blast.z-eye[2]);
    shake=Math.max(shake,(1-t/1.2)**2*clamp(1-d/140,0,1)*1.6);
  }
  for(const enemy of view.enemies??[]){
    if(!(enemy.scale>1)||!(enemy.speedNow>.4)||!Number.isFinite(enemy.y))continue;
    const d=Math.hypot(enemy.x-eye[0],enemy.z-eye[2]),gait=enemyGait(enemy);
    if(d<75&&gait!==null)shake=Math.max(shake,Math.abs(Math.sin(gait))**24*(1-d/75)*.6);
  }
  return Math.min(shake,1.6);
}
// Per-frame view settings for the renderer: field of view widening with speed, speed blur and
// the light of explosions or the launch engines.
let lastEye=null,steadyEye=null;
function viewOptions(view,eye,dt){
  const travelled=lastEye?Math.hypot(eye[0]-lastEye[0],eye[1]-lastEye[1],eye[2]-lastEye[2]):0;
  lastEye=[...eye];
  const speed=travelled<20?travelled/Math.max(dt,.001):0;
  const options={speed,fov:save.fov+(active&&motion.vehicle?clamp((speed-9)/21,0,1)*7:0)};
  if(active&&save.motionBlur&&!reduceMotion.matches)options.blur=clamp((speed-3)/20,0,1);
  if(active&&!motion.station)options.light=missionLight(view,eye,performance.now()/1000);
  return options;
}
function visualGround(x,z){
  const tile=world.cache.at(x,z);
  if(tile)return sampleHeight(tile,x,z);
}
function shadowGround(x,z){
  const tile=world.cache.at(x,z);
  if(!tile)return;
  const height=sampleHeight(tile,x,z);
  if(!terrainWater(tile,x,z,height))return height;
}

function frame(now){
  requestAnimationFrame(frame);
  audio.setPaused(document.hidden||panel.open);
  if(travelling)travelProgress();
  if(document.hidden||!renderer||travelling&&!arrivalReady||panel.open){
    frameTime=0;nextFrame=0;frameAverage=0;lastTuning=now;stableWindows=0;
    return;
  }
  if(!startTime)startTime=now;
  const target=renderer.software?1000/30:1000/60;
  if(now+1<nextFrame)return;
  nextFrame=Math.max(nextFrame+target,now+target*.35);
  const interval=frameTime?now-frameTime:target;
  const dt=Math.min(MAX_BATCH_MS,interval)/1000;frameTime=now;
  const elapsed=(now-startTime)/1000;
  const visual=renderedMission(now);
  const damage=Math.round(Math.max(0,1-(now-damageAt)/850)*100)/100;
  if(damage!==shownDamage){shownDamage=damage;$('damage').style.opacity=String(damage);}
  let eye,goal,state=null,flight=null;
  pollGamepad(dt);
  countFrame(now);
  if(active){
    advanceMotion(now);
    state=trainState(motion.train,transitClock());
    const decay=Math.exp(-dt*11);
    for(let i=0;i<3;i++)correction[i]*=decay;
    if(correction.some(offset=>Math.abs(offset)>1e-5))keepCameraOutOfWalls(motion,correction,terrain);
    if(state&&motion.train?.boardedAt){
      const pose=railPose(state.leg,state.distance);
      eye=[pose.x+pose.dx*2.1,pose.y+2.66,pose.z+pose.dz*2.1];
      yaw=heading(pose.yaw+viewOffset);position=[eye[0],eye[2]];
    }else if(motion.vehicle){
      eye=followCar(motion);yaw=heading(motion.yaw+viewOffset);
    }else eye=[motion.x+correction[0],motion.y+PLAYER_HEIGHT+bob+correction[1],motion.z+correction[2]];
    steadyEye=[...eye];
    const shake=cameraShake(visual,eye);
    if(shake>0){
      eye[0]+=(Math.sin(now*.055)+Math.sin(now*.131)*.45)*.12*shake;
      eye[1]+=(Math.cos(now*.071)+Math.sin(now*.163)*.4)*.09*shake;
      eye[2]+=Math.sin(now*.089+1.3)*.1*shake;
    }
    const direction=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
    goal=eye.map((n,i)=>n+direction[i]);
    if(!motion.station&&Math.hypot(eye[0]-airport.x,eye[2]-airport.z)<1250){
      const seconds=flightStart===null?(animationEpoch+now/1000)%66:(now-flightStart)/1000;
      flight=planePose(seconds);flightSeconds=seconds;
      if(flightStart!==null){
        if(flight&&Math.hypot(flight.x-eye[0],flight.z-eye[2])<1150)goal=[flight.x,flight.y+3.2,flight.z];
        else flightStart=null;
      }
    }
    if(now-hudTime>95){
      hudTime=now;updateTransport();compass();missionHud(missionView,now);
    }
  }else{
    const hero=cities[0];
    [eye,goal]=hero.hero.map(([x,y,z])=>{
      const [a,b]=toGlobal(hero.id,x,z);return [a,y+Math.max(0,rawHeight(a,b)),b];
    });
    if(!reduceMotion.matches){
      eye[0]+=Math.sin(elapsed*.15)*3.5;goal[1]+=Math.sin(elapsed*.18);
    }
  }
  if(active&&motion.station){
    const key='metro:'+Math.round(eye[0]/48)+','+Math.round(eye[2]/48)+':'+save.quality;
    if(key!==meshKey){
      meshKey=key;renderer.load(metroBatches(eye[0],eye[2]),125,235);hasMeshes=true;
    }
  }else stream(eye[0],eye[2],now,active?null:[goal[0],goal[2]]);
  if(hasMeshes){
    tuneScale(now,interval,target);
    if(now>=nextWalker){
      const underground=active&&motion.station;
      const focus=active?{x:motion.x,y:motion.y+PLAYER_HEIGHT,z:motion.z,radius:motion.vehicle?2.7:motion.train?.boardedAt?0:1.5}:null;
      walkers=underground?{}:peopleMeshes(world.pedestrians,animationEpoch+now/1000,eye,visualGround,renderer.detailedActors===true,focus);
      if(active&&motion.vehicle){
        const s=Math.sin(motion.yaw),c=Math.cos(motion.yaw),t=motion.y;
        const a=terrain.support(motion.x+s*1.5,motion.z-c*1.5,t)??t;
        const b=terrain.support(motion.x-s*1.5,motion.z+c*1.5,t)??t;
        updateVehicleModel(walkers,motion,Math.atan2(a-b,3),driveInput,now);
      }
      if(active&&walkers.detailed&&!motion.vehicle&&!motion.station&&!motion.train?.boardedAt)playerShadow(walkers,now);
      if(state)drawTrain(walkers,state);
      if(flight)drawPlane(walkers,flight);
      if(!underground)drawMission(walkers,active?visual:{phase:'books',lift:0},eye,elapsed,renderer.software||save.quality==='low',visualGround);
      if(!underground&&!renderer.software)drawBirds(walkers,eye,animationEpoch+now/1000,visualGround);
      if(!underground&&Math.hypot(eye[0]-airport.x,eye[2]-airport.z)<325)
        for(const x of [851,902,971])drawPlane(walkers,{x,y:airport.elevation,z:2023,yaw:.18},'d6ddd7');
      nextWalker=now+1000/30-1;
    }
    const light=active&&motion.station?undergroundLight:cityLighting(now,eye[0],eye[2]),signal=signalAt(animationEpoch+now/1000);
    const options=viewOptions(visual,active?steadyEye:eye,dt);
    const rendered=renderer.render(eye,goal,light,elapsed,walkers,arrivalBatch,signal,options);
    listen(visual,eye,options.speed,flight,state);
    if(arrivalReady&&rendered)finishArrival();
  }
}
// Every preference shown in the settings panel; values are validated again by readProgress.
const settingRows=[
  {key:'quality',title:'描画品質',text:'自動では滑らかさに合わせて解像度を調整します。',options:[['auto','自動'],['high','高精細'],['low','軽量']]},
  {key:'sensitivity',title:'視点の感度',text:'ドラッグ、マウス、右スティックで見回す速さです。',options:[[.65,'低い'],[1,'標準'],[1.5,'高い']]},
  {key:'fov',title:'視野角',text:'広くすると周りが見やすくなります。運転中は速度に合わせて少し広がります。',options:[[61,'標準'],[70,'広め'],[78,'広角']]},
  {key:'invertY',title:'上下の視点操作',text:'上下の向きを飛行機の操縦のように反転します。',options:[[false,'標準'],[true,'反転']]},
  {key:'mouseLock',title:'マウスで見回す',text:'画面をクリックするとカーソルを固定し、ドラッグせずに見回せます。Escで解除します。',options:[[false,'オフ'],[true,'オン']],desktop:true},
  {key:'motionBlur',title:'モーションブラー',text:'速く移動しているときに周りを流れるようにぼかします。',options:[[true,'オン'],[false,'オフ']]},
  {key:'shake',title:'画面の揺れ',text:'爆発や巨人の足音、発射の振動で視点が揺れます。',options:[[true,'オン'],[false,'オフ']]},
  {key:'volume',title:'音量',text:'街の音、足音、車、爆発などの効果音です。Mキーで消音を切り替えられます。',options:[[0,'オフ'],[.35,'小'],[.7,'中'],[1,'大']]},
  {key:'showFps',title:'フレームレート表示',text:'画面の右下に1秒あたりの描画回数を表示します。',options:[[false,'オフ'],[true,'オン']]}
];
function settings(){
  const desktop=!coarsePointer.matches;
  return settingRows.filter(row=>!row.desktop||desktop).map(row=>'<div class="setting"><div><b>'+row.title+'</b><p>'+row.text+
    '</p></div><select id="setting-'+row.key+'" aria-label="'+row.title+'">'+
    row.options.map(([,label],i)=>'<option value="'+i+'">'+label+'</option>').join('')+'</select></div>').join('')+
  '<div class="setting"><div><b>全画面表示</b><p>端末が対応していれば横画面に切り替わります。Fキーでも切り替えられます。</p></div><button id="fullBtn">'+(document.fullscreenElement?'全画面を終了':'全画面にする')+'</button></div>'+
  '<div class="setting"><div><b>操作</b><p>PCはWASDで移動・運転、Vで乗降、Eで地下鉄などの操作、Escで設定を開きます。運転中はShiftでブレーキ。'+
  'ゲームパッドは左スティックで移動、右スティックで視点、Aで走る・ブレーキ、Bで乗降、Xで地下鉄などの操作、スタートで設定です。'+
  'スマホでは左のスティックと画面内のボタンを使えます。</p></div></div>';
}
function syncSettings(){
  for(const row of settingRows){
    const select=$('setting-'+row.key);
    if(select)select.value=String(Math.max(0,row.options.findIndex(([value])=>value===save[row.key])));
  }
}
function openPanel(){
  if(travelling||missionTerminal(missionView.phase))return;
  releaseControls();panelName='settings';$('toast').classList.remove('visible');toastQueue.length=0;
  if(document.pointerLockElement)document.exitPointerLock?.();
  panelBody.innerHTML=settings();
  syncSettings();
  for(const row of settingRows){
    const select=$('setting-'+row.key);
    if(!select)continue;
    select.onchange=async()=>{
      const value=row.options[Number(select.value)]?.[0];
      if(value===undefined||!await saveProgress(()=>({[row.key]:value}))){syncSettings();toast(row.title+'を保存できませんでした');}
    };
  }
  $('fullBtn').onclick=toggleFullscreen;
  if(!panel.open)panel.showModal();
  panel.scrollTop=0;
}
function syncFullscreen(){
  releaseControls();
  const button=$('fullBtn');
  if(button)button.textContent=document.fullscreenElement?'全画面を終了':'全画面にする';
}
async function toggleFullscreen(){
  try{
    if(document.fullscreenElement){await document.exitFullscreen();}
    else if(document.documentElement.requestFullscreen){
      await document.documentElement.requestFullscreen();
      if(matchMedia('(pointer:coarse)').matches&&screen.orientation?.lock){
        try{await screen.orientation.lock('landscape');}catch{}
      }
    }else throw Error('Fullscreen unavailable');
    syncFullscreen();
  }catch{toast('このブラウザでは全画面表示を利用できません');}
}
document.addEventListener('fullscreenchange',syncFullscreen);
screen.orientation?.addEventListener?.('change',releaseControls);
document.querySelector('[data-panel="settings"]').onclick=openPanel;
$('closePanel').onclick=()=>panel.close();
panel.addEventListener('close',()=>{
  if(panel.open)return;
  panelName='';releaseControls();
});
panel.addEventListener('click',e=>{
  if(e.target!==panel)return;
  const b=panel.getBoundingClientRect();
  if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)panel.close();
});
$('start').onclick=begin;
$('restart').onclick=restart;
$('homeBtn').onclick=()=>{if(active&&!travelling){writeCheckpoint();changeActive(false);}};
$('retry').onclick=()=>location.reload();
$('cloudRetry').onclick=()=>location.reload();
$('vehicleBtn').onclick=()=>void useTransport('vehicle');
$('transportBtn').onclick=()=>void useTransport($('transportBtn').dataset.action);
$('surfaceBtn').onclick=()=>void useTransport('metro-exit');
const controlKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyV'];
function eventClock(event){
  const now=performance.now();
  return event.timeStamp>0?Math.min(event.timeStamp,now):now;
}
function finishLook(){
  if(!active||travelling)return;
  if(journey.mode==='local'){writeCheckpoint();return;}
  if(motion.vehicle||motion.train?.boardedAt)return;
  if(journey.connected&&Math.abs(heading(yaw-lastHeading))>.0005&&appendSample([1,0,0,heading(yaw),false])){
    lastHeading=yaw;flushDrive(!wasMoving);
  }
}
window.addEventListener('keydown',e=>{
  if(!renderer||!active||panel.open||travelling||!controlKeys.includes(e.code)||e.ctrlKey||e.metaKey||e.altKey)return;
  e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyV'){void useTransport('vehicle');return;}
  if(canMove()&&!missionTerminal(missionView.phase)){
    advanceMotion(eventClock(e));keys.add(e.code);
  }
});
window.addEventListener('keyup',e=>{
  if(!keys.has(e.code))return;
  advanceMotion(eventClock(e));keys.delete(e.code);
  if(e.code==='ArrowLeft'||e.code==='ArrowRight')finishLook();
});
window.addEventListener('online',()=>{if(journey.mode==='waiting')void journey.start();});
window.addEventListener('storage',e=>{
  if(e.key!==progressKey||!e.newValue)return;
  try{
    applyProgress(readProgress(localStorage));
  }catch{}
});
window.addEventListener('blur',releaseControls);
window.addEventListener('resize',()=>{if(lookPointer||movePointer)releaseControls();});
window.addEventListener('pagehide',event=>{
  writeCheckpoint();releaseControls();
  if(event.persisted)journey.suspend();
});
window.addEventListener('pageshow',event=>{if(event.persisted)journey.resume();});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){journey.wake();if(active)void keepAwake(true);return;}
  frameTime=0;nextFrame=0;
  writeCheckpoint();releaseControls();
});
function rotateView(dx,dy,gain){
  flightStart=null;
  const delta=dx*gain;
  if(motion.vehicle)viewOffset=clamp(viewOffset+delta,-.93,.93);
  else if(motion.train?.boardedAt)viewOffset=heading(viewOffset+delta);
  else yaw=heading(yaw+delta);
  pitch=clampPitch(pitch-dy*gain*(save.invertY?-1:1));
}
let lockReleasedAt=-Infinity;
look.addEventListener('pointerdown',e=>{
  audio.unlock();
  if(!renderer||!active||!canMove()||panel.open||travelling||lookPointer||e.button!==0)return;
  // With "mouse look" on, a click captures the cursor and plain mouse movement turns the view.
  if(save.mouseLock&&e.pointerType==='mouse'&&look.requestPointerLock){
    if(document.pointerLockElement!==look)try{look.requestPointerLock()?.catch?.(()=>{});}catch{}
    return;
  }
  lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);
});
look.addEventListener('pointermove',e=>{
  if(lookPointer?.id!==e.pointerId)return;
  rotateView(e.clientX-lookPointer.x,e.clientY-lookPointer.y,.0046*save.sensitivity);
  lookPointer.x=e.clientX;lookPointer.y=e.clientY;
});
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==look||!active||panel.open||travelling)return;
  rotateView(e.movementX,e.movementY,.0028*save.sensitivity);
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===look)return;
  lockReleasedAt=performance.now();finishLook();
});
// Long presses and right clicks on the game view do not open the browser's menu.
stage.addEventListener('contextmenu',e=>{if(active&&!panel.open)e.preventDefault();});
// Shortcuts: F full screen, M mute, E the transport button, Escape the settings.
let unmutedVolume=save.volume||.7;
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  audio.unlock();
  if(e.repeat||!renderer||e.target instanceof HTMLSelectElement)return;
  if(e.code==='KeyF'&&!panel.open){e.preventDefault();void toggleFullscreen();return;}
  if(e.code==='KeyM'){
    e.preventDefault();
    if(save.volume)unmutedVolume=save.volume;
    const volume=save.volume?0:unmutedVolume;
    void saveProgress(()=>({volume})).then(saved=>{if(saved)toast(volume?'音を戻しました':'消音しました');});
    return;
  }
  if(!active||travelling||panel.open)return;
  if(e.code==='KeyE'){
    const button=$('transportBtn');
    if(!button.hidden&&!button.disabled){e.preventDefault();void useTransport(button.dataset.action);}
    return;
  }
  if(e.code==='Escape'&&!document.pointerLockElement&&performance.now()-lockReleasedAt>400){e.preventDefault();openPanel();}
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(event,e=>{
  if(lookPointer?.id===e.pointerId){lookPointer=null;finishLook();}
});
function moveStick(e){
  const {x,y,range}=movePointer,dx=e.clientX-x,dy=e.clientY-y,distance=Math.hypot(dx,dy);
  const strength=clamp((distance/range-.15)/.85,0,1);
  if((strength>0)!==(Math.hypot(...move)>0))advanceMotion(eventClock(e));
  const scale=distance?strength/distance:0;
  move=[dx*scale,dy*scale];
  stick.style.transform='translate('+move[0]*range+'px,'+move[1]*range+'px)';
}
joystick.addEventListener('pointerdown',e=>{
  if(!renderer||movePointer!==null||!active||!canMove()||panel.open||travelling||e.button!==0)return;
  const rect=joystick.getBoundingClientRect();
  if(!rect.width)return;
  movePointer={id:e.pointerId,x:rect.left+rect.width*.5,y:rect.top+rect.height*.5,range:rect.width*.28};
  joystick.setPointerCapture(e.pointerId);moveStick(e);
});
joystick.addEventListener('pointermove',e=>{if(movePointer?.id===e.pointerId)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{
  if(movePointer?.id!==e.pointerId)return;
  if(event==='pointerup')advanceMotion(eventClock(e));
  else stopMotion();
  movePointer=null;move=[0,0];stick.style.transform='';
});
runButton.onclick=()=>{advanceMotion(performance.now());if(renderer&&canMove())setRunning(!running);};
function useRenderer(canvas,next){
  if(scene!==canvas)scene.replaceWith(canvas);
  scene=canvas;renderer=next;
  renderer.setQuality(save.quality);
  void loadArchitectureMaterials().then(bytes=>{
    if(renderer===next)next.setMaterials(bytes);
  }).catch(error=>console.info('Architectural materials unavailable',error.message));
  meshKey='';hasMeshes=false;autoScale=1;frameTime=0;nextFrame=0;frameAverage=0;
  $('failure').hidden=true;
  updateStartButton();
}
async function fallback(generation){
  const {softwareRenderer}=await import('./software.js');
  if(generation!==rendererGeneration)return;
  const replacement=hardwareScene.cloneNode();
  useRenderer(replacement,softwareRenderer(replacement,shadowGround));
}
hardwareScene.addEventListener('webglcontextlost',e=>{
  e.preventDefault();
  if(scene!==hardwareScene)return;
  releaseControls();
  renderer?.dispose?.();renderer=null;
  const generation=++rendererGeneration;
  void fallback(generation).catch(()=>{
    if(generation===rendererGeneration)$('failure').hidden=false;
  });
});
hardwareScene.addEventListener('webglcontextrestored',()=>{
  try{
    const next=createRenderer(hardwareScene);
    rendererGeneration++;
    releaseControls();
    useRenderer(hardwareScene,next);
  }catch(error){console.info('WebGL 2 restoration unavailable',error.message);}
});
// Parked cars with the server's latest changes applied, rebuilt only when a new snapshot arrives
// (collision checks call this many times per physics step).
let carsView=null,carsNow=[];
function missionCars(){
  if(carsView!==missionView){
    carsView=missionView;
    const changes=new Map(missionView.cars.map(car=>[car.id,car]));
    carsNow=missionData.cars.map(base=>changes.get(base.id)??base);
  }
  return carsNow;
}
function carObstacle(x,z,y,id){
  return missionCars().some(car=>{
    const dx=x-car.x,dz=z-car.z;
    if(car.id===id||car.id===missionView.driver||Math.abs(dx)>2.7||Math.abs(dz)>2.7||
      Number.isFinite(y)&&Math.abs(y-car.y)>1.9)return false;
    const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
    return Math.abs(dx*c+dz*s)<1.20&&Math.abs(dx*s-dz*c)<2.4;
  });
}
async function boot(){
  try{
    // The world, the mission data and the server check start while the shaders compile.
    world=createRegion();
    terrain=terrainSampler(world.cache,{
      plazaFloor:(x,z,y)=>journey.connected?missionPlazaFloor(missionView,x,z,y):mission.plazaFloor(x,z,y),
      carObstacle:(x,z,y,id)=>journey.connected?carObstacle(x,z,y,id):mission.carObstacle(x,z,y,id)
    });
    void requestLaunchAssembly().catch(()=>{});
    updateStart();journey.start();
    try{
      const next=createRenderer(hardwareScene,{wait:false});
      try{await next.ready;}catch(error){next.dispose();throw error;}
      if(!renderer)useRenderer(hardwareScene,next);
    }catch(error){
      console.info('WebGL 2 unavailable, using software 3D',error.message);
      await fallback(++rendererGeneration);
    }
    requestAnimationFrame(frame);
  }catch(error){
    console.error(error);$('failure').hidden=false;
  }
}
void boot();
