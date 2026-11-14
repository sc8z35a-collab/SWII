import {missionData} from './mission-data.js';
import {ASCENT_MS,BOOK_TARGET,CANNON_DROP,CANNON_MUZZLE,CANNON_PITCH,EVACUATION_MS,FIRE_INTERVAL,PLAYER_HEIGHT,SURVIVAL_MS,atPad,launchHeight,launchSite} from './mission-layout.js';
import {nearVehicle,switchVehicle} from './driving.js';
import {createPursuit} from './pursuit.js';
import {spawn} from './physics.js';

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
  let pursuit=createPursuit(sight,initial?.pursuit);
  const state={phase:initial?.phase??'books',time:initial?.time??0,hp:initial?.hp??4,aim:initial?.aim??Math.PI,
    missiles:initial?.missiles??[],launches:initial?.launches??0,seq:initial?.seq??0};
  let time=0,event=null,blasts=[],driver=null,released=[];
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
    state.hp=Math.max(0,state.hp-(shield?1:2));
    if(!state.hp){
      state.phase='lost';state.time=0;emit('lost');
    }else emit(shield?'vehicleHit':'hit');
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
    if(previous==='ascent'||previous==='survival'){
      const face=Math.atan2(player.x-launchSite.x,launchSite.z-player.z)-state.aim;
      state.aim+=Math.atan2(Math.sin(face),Math.cos(face))*Math.min(1,ms*.004);
    }
    blasts=blasts.filter(blast=>time-blast.at<2600);
    if(previous==='books'){
      collect(before,player,terrain);
      if(state.phase==='books'){
        const captured=pursuit.step(player,terrain,ms);
        if(captured){
          if(player.vehicle)updateParking(player);
          const fresh=missionSpawn(),y=terrain.support(fresh.x,fresh.z);
          if(y!==null){
            Object.assign(player,fresh,{y,vehicle:false,vehicleId:null,station:null,train:null});
            connect(player);pursuit=createPursuit(sight);emit('caught',{enemy:captured});
          }
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
    return {...state,picked:[...picked],cars:[...changes.values()],pursuit:state.phase==='books'?pursuit.save():[]};
  }
  function view(){
    return {phase:state.phase,elapsed:state.time,hp:state.hp,lift:launchHeight(state.phase,state.time),picked:[...picked],aim:state.aim,
      cars:[...changes.values()],driver,missiles:state.missiles.map(m=>({...m,track:[...m.track]})),
      blasts:blasts.map(({at,...b})=>({...b,age:time-at})),enemies:state.phase==='books'?pursuit.view():[],
      releases:state.phase==='evacuate'&&state.time<4100?released:[],launches:state.launches,event};
  }
  return {connect,plazaFloor:(x,z,y)=>missionPlazaFloor({lift:launchHeight(state.phase,state.time)},x,z,y),
    nearbyCar,carObstacle,changeVehicle,update,save,view,occupied:()=>state.phase==='books',
    phase:()=>state.phase,version:()=>state.seq,missiles:()=>state.missiles};
}
