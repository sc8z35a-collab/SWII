import {missionData} from './mission-data.js';
import {ASCENT_MS,BOOK_TARGET,CANNON_DROP,CANNON_MUZZLE,CANNON_PITCH,EVACUATION_MS,FIRE_INTERVAL,PLAYER_HEIGHT,SURVIVAL_MS,atPad,launchHeight,launchSite} from './mission-layout.js';
import {nearVehicle,switchVehicle} from './driving.js';
import {createPursuit} from './pursuit.js';
import {spawn} from './physics.js';
import {RD2,aimDirection,segmentHitsCapsule,segmentHitsSphere,stepBullet} from './ballistics.js';
import {INK_CAPACITY,aimPoint,findLock,inkRounds,lockLife,lockWindow,steerInk,weaponById,weapons} from './weapons.js';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const phases=new Set(['books','evacuate','ascent','survival','lost','escaped']);
const books=missionData.books;
const byCar=new Map(missionData.cars.map(car=>[car.id,car]));
const carCell=40,key=(x,z)=>Math.floor(x/carCell)+':'+Math.floor(z/carCell);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
const distance=(a,b)=>Math.hypot(...b.map((n,i)=>n-a[i]));
const targetOf=p=>[p.x,p.y+(p.vehicle?.83:.97),p.z];
const smooth=t=>{const a=clamp(t,0,1);return a*a*(3-2*a);};
const pad=missionData.padFloor;
const MAX_DROPS=3,FIRST_DROP=9000,DROP_LIFE=150000,DROP_FALL=900;
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const brief=n=>Math.round(n*1000)/1000;
const footings=[[-45,-45,4.1,4.1],[45,-45,4.1,4.1],[-45,45,4.1,4.1],[45,45,4.1,4.1],
  [-4.67,46,1.22,1.1],[4.67,46,1.22,1.1]];

export const missionSpawn=()=>spawn('tokyo');
export const missionTerminal=phase=>phase==='lost'||phase==='escaped';
export function missionPlazaFloor(mission,x,z,level){
  if(!atPad(x,z))return;
  const elevation=mission?.lift??0;
  if(elevation>1.6&&Number.isFinite(level)&&level<pad+elevation-3)return null;
  if(elevation>1.6&&level===undefined)return null;
  if(footings.some(([a,b,w,d])=>Math.abs(x-launchSite.x-a)<w&&Math.abs(z-launchSite.z-b)<d))return null;
  return pad+elevation;
}
function crossesGate(a,b){
  if(a.station||b.station||a.vehicle||b.vehicle)return false;
  const {x,z,half,height}=launchSite.gate;
  if(a.z===b.z||(a.z<z)===(b.z<z))return false;
  const t=(z-a.z)/(b.z-a.z),y=a.y+(b.y-a.y)*t;
  return Math.abs(a.x+(b.x-a.x)*t-x)<half&&y>=pad-.45&&y+PLAYER_HEIGHT<pad+height;
}
function nearestPoint(a,b,p){
  const ab=b.map((v,i)=>v-a[i]),ap=p.map((v,i)=>v-a[i]);
  const t=clamp(dot(ab,ap)/(dot(ab,ab)||1),0,1);
  return a.map((v,i)=>v+ab[i]*t);
}

export function createMission(sight,saved=null){
  const initial=phases.has(saved?.phase)?saved:null;
  const picked=new Set((initial?.picked??[]).filter(id=>books[id]?.id===id));
  const changes=new Map((initial?.cars??[]).filter(car=>byCar.has(car.id)&&
    [car.x,car.y,car.z,car.yaw].every(Number.isFinite)).map(car=>[car.id,car]));
  const parking=new Map();
  function park(car){
    const id=key(car.x,car.z);
    if(!parking.has(id))parking.set(id,new Set());
    parking.get(id).add(car);
  }
  function unpark(car){
    const id=key(car.x,car.z),cars=parking.get(id);
    cars?.delete(car);
    if(!cars?.size)parking.delete(id);
  }
  for(const car of missionData.cars)park(changes.get(car.id)??car);
  const origin=missionSpawn();
  let pursuit=createPursuit(sight,initial?.pursuit,{origin});
  const whole=(value,lo,hi,fallback)=>Number.isInteger(value)&&value>=lo&&value<=hi?value:fallback;
  const state={phase:initial?.phase??'books',time:initial?.time??0,hp:initial?.hp??4,aim:initial?.aim??Math.PI,
    missiles:initial?.missiles??[],launches:initial?.launches??0,seq:initial?.seq??0,
    weapon:weaponById(initial?.weapon)?initial.weapon:'rd2',
    ink:whole(initial?.ink,0,INK_CAPACITY,INK_CAPACITY),
    sr1tMag:whole(initial?.sr1tMag,0,weapons.sr1t.magazine,weapons.sr1t.magazine),
    // RD II: 120 rounds in the magazine and 250 carried in total at the start.
    gun:{mag:whole(initial?.gun?.mag,0,RD2.magazine,RD2.magazine),
      reserve:whole(initial?.gun?.reserve,0,99999,RD2.startingRounds-RD2.magazine)},
    drops:(Array.isArray(initial?.drops)?initial.drops:[]).filter(d=>d&&[d.id,d.x,d.y,d.z,d.age].every(Number.isFinite)).slice(0,MAX_DROPS),
    dropIn:Number.isFinite(initial?.dropIn)?initial.dropIn:FIRST_DROP,dropSeq:whole(initial?.dropSeq,0,1e9,0)};
  let time=0,event=null,blasts=[],driver=null,released=[];
  let bullets=[],impacts=[],paint=[],cooldown=0,reloading=0,shots=0,rounds=0,hitSeq=0,lastHit=null,contactShield=0;
  let enemyGuns=new Map();
  const seen=(terrain,a,b)=>sight.blocked(a,b)===false&&!terrain.terrainOccludes(a,b);
  const selected=()=>weapons[state.weapon];
  function mag(){
    const gun=selected();
    if(!gun.inkCost)return state.gun.mag;
    const available=inkRounds(gun,state.ink);
    return state.weapon==='sr1t'?Math.min(state.sr1tMag,available):available;
  }
  const damageTaken=base=>Math.round(base*(selected().protection??1)*100)/100;
  function emit(kind,details={}){
    event={kind,id:++state.seq,...details};
  }
  function nearby(x,z,radius){
    const cars=[];
    for(let a=Math.floor((x-radius)/carCell);a<=Math.floor((x+radius)/carCell);a++)
      for(let b=Math.floor((z-radius)/carCell);b<=Math.floor((z+radius)/carCell);b++){
        for(const car of parking.get(a+':'+b)??[])if(car.id!==driver)cars.push(car);
      }
    return cars;
  }
  function connect(player){
    const car=changes.get(player.vehicleId)??byCar.get(player.vehicleId);
    if(player.vehicle&&(!car||car.wreck)){
      player.vehicle=false;player.vehicleId=null;
    }
    driver=player.vehicle?player.vehicleId:null;
  }
  function updateParking(player,wreck=false){
    const prior=changes.get(player.vehicleId)??byCar.get(player.vehicleId);
    if(!prior)return;
    unpark(prior);
    const {x,y,z,yaw}=player,car={...prior,x,y,z,yaw,wreck};
    changes.set(car.id,car);park(car);
  }
  function carObstacle(x,z,height,id){
    return nearby(x,z,3).some(car=>{
      if(car.id===id||Number.isFinite(height)&&Math.abs(height-car.y)>1.9)return false;
      const dx=x-car.x,dz=z-car.z,s=Math.sin(car.yaw),c=Math.cos(car.yaw);
      return Math.abs(dx*c+dz*s)<1.20&&Math.abs(dx*s-dz*c)<2.4;
    });
  }
  function nearbyCar(player){
    return nearVehicle(player,nearby(player.x,player.z,4).filter(car=>{
      const a=targetOf(player),b=[car.x,car.y+1,car.z];
      return sight.blocked(a,b)===false;
    }));
  }
  function changeVehicle(player,terrain){
    if(missionTerminal(state.phase))return null;
    const next=switchVehicle(player,terrain,player.vehicle?null:nearbyCar(player));
    if(!next)return null;
    if(player.vehicle)updateParking(player);
    connect(next);
    emit(next.vehicle?'entered':'parked');
    return next;
  }
  function collect(before,player,terrain){
    if(player.station||player.vehicle)return;
    for(const book of books){
      if(picked.has(book.id)||Math.abs(player.y-book.y)>1.05||
        Math.abs(book.x-player.x)>6||Math.abs(book.z-player.z)>6)continue;
      const base=nearestPoint([before.x,before.y,before.z],[player.x,player.y,player.z],[book.x,book.y,book.z]);
      if(distance(base,[book.x,book.y,book.z])>1.44)continue;
      const from=[base[0],base[1]+.85,base[2]],to=[book.x,book.y+.17,book.z];
      if(terrain.terrainOccludes(from,to)||sight.blocked(from,to)!==false)continue;
      picked.add(book.id);
      emit('book',{idBook:book.id,total:picked.size});
    }
    if(picked.size>=BOOK_TARGET&&crossesGate(before,player)){
      released=pursuit.view().filter(actor=>Number.isFinite(actor.y));
      state.phase='evacuate';state.time=0;emit('purified');
    }
  }
  const armed=player=>!missionTerminal(state.phase)&&!player.station&&!player.vehicle&&!player.train?.boardedAt;
  function equip(player,id){
    if(!armed(player)||!weaponById(id)||state.weapon===id)return false;
    state.weapon=id;reloading=0;
    return true;
  }
  function finishReload(){
    const gun=selected();
    if(gun.inkCost){
      state.ink=INK_CAPACITY;
      if(state.weapon==='sr1t')state.sr1tMag=gun.magazine;
    }else{
      const moved=Math.min(RD2.magazine-state.gun.mag,state.gun.reserve);
      state.gun.mag+=moved;state.gun.reserve-=moved;
    }
    reloading=0;
  }
  const needsReload=()=>selected().inkCost?state.ink<INK_CAPACITY||state.weapon==='sr1t'&&state.sr1tMag<weapons.sr1t.magazine:
    state.gun.mag<RD2.magazine&&state.gun.reserve>0;
  function reload(){
    if(missionTerminal(state.phase)||reloading>0||!needsReload())return false;
    reloading=selected().reloadMs;
    return true;
  }
  function round(origin,direction,id,lock=null,enemy=false){
    const gun=weapons[id],[x,y,z]=origin;
    const [vx,vy,vz]=direction.map(n=>n*gun.muzzleVelocity);
    bullets.push({id:++rounds,x,y,z,vx,vy,vz,age:0,travel:0,weapon:id,lock,enemy});
  }
  function shoot(player,yaw,pitch,terrain){
    if(!armed(player)||cooldown>0||reloading>0||![yaw,pitch].every(Number.isFinite))return 0;
    const remaining=mag(),gun=selected(),id=state.weapon;
    if(remaining<=0){reload();return 0;}
    const count=Math.min(gun.barrels,remaining);
    const right=[Math.cos(yaw),0,Math.sin(yaw)],forward=aimDirection(yaw,pitch);
    const eye=[player.x,player.y+PLAYER_HEIGHT,player.z];
    const lock=id==='sr1t'&&terrain&&state.phase==='books'?
      findLock(eye,yaw,pitch,lockWindow(remaining),pursuit.targets(),(a,b)=>seen(terrain,a,b))?.id:null;
    for(let barrel=0;barrel<count;barrel++){
      const side=barrel-(count-1)*.5,spread=gun.spread??0;
      const wobble=()=>(Math.random()-.5)*.0026;
      const direction=aimDirection(yaw+side*spread+wobble(),pitch+wobble());
      const origin=eye.map((n,i)=>n+forward[i]*.26+right[i]*side*.021);
      origin[1]-=.07;
      round(origin,direction,id,lock);
    }
    if(gun.inkCost){
      state.ink-=gun.inkCost;
      if(id==='sr1t')state.sr1tMag--;
    }else state.gun.mag-=count;
    shots++;cooldown=gun.cycleMs;
    if(mag()<=0)reload();
    return count;
  }
  function mark(at,flesh){
    impacts.push({id:impacts.length?impacts.at(-1).id+1:1,x:at[0],y:at[1],z:at[2],at:time,flesh});
    if(impacts.length>36)impacts.shift();
  }
  function splat(bullet,point,terrain){
    const radius=weapons[bullet.weapon].paint;
    if(!radius)return;
    const [x,y,z]=point,floor=terrain.support(x,z,y);
    if(floor===null||Math.abs(floor-y)>3.8||terrain.water?.(x,z)!=null)return;
    paint.push({id:bullet.id,x,y:floor,z,radius,weapon:bullet.weapon,enemy:bullet.enemy,at:time});
    if(paint.length>128)paint.shift();
  }
  function respawn(player,terrain,enemy){
    if(player.vehicle)updateParking(player);
    const fresh=missionSpawn(),y=terrain.support(fresh.x,fresh.z);
    if(y===null)return;
    Object.assign(player,fresh,{y,vehicle:false,vehicleId:null,station:null,train:null});
    state.hp=4;contactShield=0;enemyGuns=new Map();
    bullets=bullets.filter(bullet=>!bullet.enemy);
    connect(player);pursuit=createPursuit(sight,null,{origin});emit('caught',{enemy});
  }
  function hurt(base,kind){
    state.hp=Math.max(0,Math.round((state.hp-damageTaken(base))*100)/100);
    if(state.hp>0)emit(kind);
    else if(state.phase==='books')return;
    else{state.phase='lost';state.time=0;emit('lost');}
  }
  function fly(bullet,player,terrain,ms){
    const gun=weapons[bullet.weapon];
    const tracked=state.phase==='books'&&bullet.lock!=null?
      pursuit.targets().find(actor=>actor.id===bullet.lock&&actor.stun<=0&&Number.isFinite(actor.y)):null;
    const targetPoint=tracked&&aimPoint(tracked);
    const steer=targetPoint?(b,dt,speed)=>{if(b.age<lockLife)steerInk(b,targetPoint,dt,speed);}:null;
    let landed=false;
    const flying=stepBullet(bullet,ms/1000,(a,b)=>{
      const target=!bullet.enemy&&state.phase==='books'?pursuit.struck(a,b):null;
      const hitPlayer=bullet.enemy&&!player.station&&state.phase==='books'?(player.vehicle?
        segmentHitsSphere(a,b,targetOf(player),1.15):
        segmentHitsCapsule(a,b,[player.x,player.y,player.z],PLAYER_HEIGHT,.32)):null;
      const fraction=target?.t??hitPlayer;
      const end=fraction==null?b:lerp(a,b,fraction);
      const solid=p=>sight.blocked(a,p)===true||terrain.terrainOccludes(a,p);
      if(solid(end)){
        let near=0,far=1;
        for(let i=0;i<5;i++){
          const middle=(near+far)*.5;
          if(solid(lerp(a,end,middle)))far=middle;else near=middle;
        }
        const impact=lerp(a,end,near);
        mark(impact,false);splat(bullet,impact,terrain);landed=true;
        return false;
      }
      if(fraction==null)return true;
      if(target){
        const result=pursuit.wound(target.actor,player,gun.damage);
        hitSeq++;lastHit={id:result.id,name:result.name,hits:result.hits,down:result.down};
        if(result.stunned)emit('stunned',{enemy:result.name});
      }else hurt(.25,'hit');
      mark(end,true);splat(bullet,end,terrain);landed=true;
      return false;
    },gun,steer);
    if(!flying&&!landed)splat(bullet,[bullet.x,bullet.y,bullet.z],terrain);
    return flying;
  }
  function armEnemies(player,terrain){
    if(player.station)return;
    const gun=weapons.h1,target=targetOf(player);
    for(const actor of pursuit.targets()){
      if(actor.weapon!=='h1'||!actor.alerted||actor.stun>0||!Number.isFinite(actor.y)||distance(aimPoint(actor),target)>36)continue;
      const clip=enemyGuns.get(actor.id)??{ready:0,ink:INK_CAPACITY};
      if(time<clip.ready)continue;
      const muzzle=[actor.x,actor.y+1.25,actor.z];
      if(!seen(terrain,muzzle,target))continue;
      const spread=()=>.56*(Math.random()-.5);
      const direction=unit(target.map((n,i)=>n-muzzle[i]+spread()));
      round(muzzle,direction,'h1',null,true);
      clip.ink-=gun.inkCost;
      clip.ready=time+(clip.ink<gun.inkCost?gun.reloadMs:gun.cycleMs);
      if(clip.ink<gun.inkCost)clip.ink=INK_CAPACITY;
      enemyGuns.set(actor.id,clip);
    }
  }
  // Ammunition falls from the sky close to the player; walking over a box adds 15 rounds.
  function supply(before,player,terrain,ms){
    for(const drop of state.drops)drop.age+=ms;
    state.drops=state.drops.filter(drop=>drop.age<DROP_LIFE);
    if(state.phase!=='books'||player.station)return;
    if(!player.vehicle){
      const kept=[];
      for(const drop of state.drops){
        const base=nearestPoint([before.x,before.y,before.z],[player.x,player.y,player.z],[drop.x,drop.y,drop.z]);
        if(drop.age<DROP_FALL||Math.abs(base[1]-drop.y)>1.7||Math.hypot(base[0]-drop.x,base[2]-drop.z)>1.35){kept.push(drop);continue;}
        state.gun.reserve+=RD2.pickupRounds;
        emit('ammo',{rounds:RD2.pickupRounds,total:state.gun.mag+state.gun.reserve});
      }
      state.drops=kept;
    }
    state.dropIn-=ms;
    if(state.dropIn>0||state.drops.length>=MAX_DROPS)return;
    state.dropIn=1500;
    for(let attempt=0;attempt<7;attempt++){
      const angle=Math.random()*Math.PI*2,range=4.5+Math.random()*7.5;
      const x=player.x+Math.sin(angle)*range,z=player.z+Math.cos(angle)*range,y=terrain.support(x,z,player.y);
      if(y===null||Math.abs(y-player.y)>2.4)continue;
      const from=[player.x,player.y+1.2,player.z],to=[x,y+.3,z];
      if(sight.blocked(from,to)!==false||terrain.terrainOccludes(from,to))continue;
      state.drops.push({id:++state.dropSeq,x,y,z,age:0});
      state.dropIn=(state.gun.mag+state.gun.reserve<60?8000:15000)+Math.random()*6000;
      break;
    }
  }
  function fire(){
    const yaw=state.aim,c=Math.cos(CANNON_PITCH);
    const direction=[Math.sin(yaw)*c,Math.sin(CANNON_PITCH),-Math.cos(yaw)*c];
    const [dx,dy,dz]=direction.map(axis=>axis*CANNON_MUZZLE);
    state.missiles.push({id:++state.launches,x:launchSite.x+dx,y:pad+launchSite.lift-CANNON_DROP+dy,z:launchSite.z+dz,
      direction,age:0,track:[],diving:false});
    emit('fire',{shot:state.launches});
  }
  function strike(missile,at,player,terrain,hit){
    blasts.push({id:missile.id,x:at[0],y:at[1],z:at[2],at:time,strong:hit});
    if(!hit)return;
    const shield=Boolean(player.vehicle);
    if(shield){
      updateParking(player,true);
      const exit=switchVehicle({...player,vx:0,vz:0},terrain);
      if(exit)Object.assign(player,exit);
      else player.clearWreck=player.vehicleId;
      player.vehicle=false;player.vehicleId=null;player.vx=player.vy=player.vz=0;
      driver=null;
    }
    hurt(shield?1:2,shield?'vehicleHit':'hit');
  }
  function advance(missile,player,terrain,ms){
    const m=missile,dt=ms/1000,a=[m.x,m.y,m.z],target=targetOf(player);
    m.age+=ms;
    if(m.age>=95000)return false;
    const gap=Math.hypot(target[0]-a[0],target[2]-a[2]),rangeToTarget=distance(a,target);
    if(gap<405)m.diving=true;
    const gain=clamp(gap/440,0,1);
    const cruise=pad+455;
    const aim=[target[0]+clamp(player.vx??0,-30,30)*.29,
      m.diving?target[1]+10*gain+Math.min(170,Math.max(0,gap-58)*.49):cruise,
      target[2]+clamp(player.vz??0,-30,30)*.29];
    const wanted=unit(aim.map((v,i)=>v-a[i]));
    const correction=clamp(dt*(m.diving?(rangeToTarget<37?.68:2.35):1.6),0,.9);
    if(m.age>180)m.direction=unit(m.direction.map((v,i)=>v+(wanted[i]-v)*correction));
    const speed=112+(m.diving?-10:21)*smooth(m.age/1100);
    const b=a.map((v,i)=>v+m.direction[i]*speed*dt);
    const touch=nearestPoint(a,b,target),range=player.vehicle?2.65:1.62;
    const near=distance(touch,target)<range&&m.age>330;
    const limitedY=b[1]<Math.max(player.y+75,215);
    const surface=limitedY?sight.blocked(a,b,.23):false;
    const ground=limitedY&&terrain.terrainOccludes(a,b);
    if(surface===true||ground){
      const splash=distance(a,target)<(player.vehicle?3.25:2.65)&&!player.station&&
        sight.blocked(a,target)===false&&!terrain.terrainOccludes(a,target);
      strike(m,a,player,terrain,splash);return false;
    }
    if(near&&!player.station&&surface!==null&&sight.blocked(touch,target)===false){
      strike(m,touch,player,terrain,true);return false;
    }
    if(near&&player.station){
      strike(m,a,player,terrain,false);return false;
    }
    if(m.track.length===0||distance(m.track[0],a)>7.7){
      m.track.unshift(a);if(m.track.length>19)m.track.pop();
    }
    [m.x,m.y,m.z]=b;
    return true;
  }
  function update(before,player,terrain,ms){
    if(ms<=0||missionTerminal(state.phase))return;
    const previous=state.phase,elevation=launchHeight(previous,state.time);
    if(player.clearWreck!==undefined){
      const wreck=changes.get(player.clearWreck);
      if(!wreck||Math.hypot(player.x-wreck.x,player.z-wreck.z)>2.8)delete player.clearWreck;
    }
    time+=ms;state.time+=ms;
    cooldown=Math.max(0,cooldown-ms);
    if(reloading>0&&(reloading-=ms)<=0)finishReload();
    if(bullets.length)bullets=bullets.filter(bullet=>fly(bullet,player,terrain,ms));
    if(previous==='books'&&state.hp<=0){respawn(player,terrain,'H1の追跡者');return;}
    paint=paint.filter(mark=>time-mark.at<35000);
    impacts=impacts.filter(impact=>time-impact.at<700);
    supply(before,player,terrain,ms);
    if(previous==='ascent'||previous==='survival'){
      const face=Math.atan2(player.x-launchSite.x,launchSite.z-player.z)-state.aim;
      state.aim+=Math.atan2(Math.sin(face),Math.cos(face))*Math.min(1,ms*.004);
    }
    blasts=blasts.filter(blast=>time-blast.at<2600);
    if(previous==='books'){
      collect(before,player,terrain);
      if(state.phase==='books'){
        const captured=pursuit.step(player,terrain,ms);
        armEnemies(player,terrain);
        if(captured&&time>=contactShield){
          if(selected().protection){hurt(4,'hit');contactShield=time+1050;}
          if(!selected().protection||state.hp<=0)respawn(player,terrain,captured);
        }
      }
    }else if(previous==='evacuate'&&state.time>=EVACUATION_MS){
      state.phase='ascent';state.time-=EVACUATION_MS;emit('rise');
    }else if(previous==='ascent'&&state.time>=ASCENT_MS){
      state.phase='survival';state.time-=ASCENT_MS;emit('armed');
    }else if(previous==='survival'){
      if(state.time>=SURVIVAL_MS){
        state.phase='escaped';state.time=SURVIVAL_MS;state.missiles=[];emit('escaped');
        player.vx=player.vy=player.vz=0;
        return;
      }
      if(state.time>=(state.launches+1)*FIRE_INTERVAL)fire();
      state.missiles=state.missiles.filter(m=>state.phase==='survival'&&advance(m,player,terrain,ms));
      if(state.phase==='lost')state.missiles=[];
    }
    if(previous==='evacuate'||previous==='ascent'){
      const lift=launchHeight(state.phase,state.time)-elevation;
      if(lift>0&&atPad(player.x,player.z)&&player.y>=pad+elevation-.33&&
        player.y<=pad+elevation+1.25){
        player.y+=lift;
        player.vy=0;
      }
    }
  }
  function save(){
    return {...state,gun:{...state.gun},drops:state.drops.map(drop=>({...drop})),
      picked:[...picked],cars:[...changes.values()],pursuit:state.phase==='books'?pursuit.save():null};
  }
  function view(){
    return {phase:state.phase,elapsed:state.time,hp:state.hp,lift:launchHeight(state.phase,state.time),picked:[...picked],aim:state.aim,
      cars:[...changes.values()],driver,missiles:state.missiles.map(m=>({...m,track:[...m.track]})),
      blasts:blasts.map(({at,...b})=>({...b,age:time-at})),enemies:state.phase==='books'?pursuit.view():[],
      releases:state.phase==='evacuate'&&state.time<4100?released:[],launches:state.launches,event,
      gun:{id:state.weapon,mag:mag(),reserve:state.gun.reserve,ink:state.ink,
        canReload:needsReload(),reloading:Math.max(0,reloading),shots,hitSeq,lastHit},
      bullets:bullets.map(({id,weapon,enemy,x,y,z,vx,vy,vz,age})=>({id,weapon,enemy,x:brief(x),y:brief(y),z:brief(z),vx:brief(vx),vy:brief(vy),vz:brief(vz),age:Math.round(age)})),
      paint:paint.map(({at,...mark})=>({...mark,age:time-at})),
      impacts:impacts.map(({at,x,y,z,...impact})=>({...impact,x:brief(x),y:brief(y),z:brief(z),age:Math.round(time-at)})),
      drops:state.drops.map(({id,x,y,z,age})=>({id,x:brief(x),y:brief(y),z:brief(z),age:Math.round(age)}))};
  }
  return {connect,plazaFloor:(x,z,y)=>missionPlazaFloor({lift:launchHeight(state.phase,state.time)},x,z,y),
    nearbyCar,carObstacle,changeVehicle,update,save,view,occupied:()=>state.phase==='books',
    phase:()=>state.phase,version:()=>state.seq,missiles:()=>state.missiles,
    shoot,reload,equip,hunters:()=>state.phase==='books'?pursuit.hunters():[]};
}
