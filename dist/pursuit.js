import {PLAYER_HEIGHT} from './mission-layout.js';
import {CAR_SPEED} from './driving.js';
import {missionData} from './mission-data.js';
import {RD2,segmentHitsCapsule,segmentHitsSphere} from './ballistics.js';

// Sight reaches twice as far as it used to and every runner is 1.3 times faster.
const SIGHT_GAIN=2,RUN_GAIN=1.3;
// presence: the radius in which a creature feels the player through walls.
// trace: how close it has to come to a footprint to pick up the trail.
export const enemyTypes=[
  {id:'pursuer',name:'追跡者',count:5,scale:1,speed:18.5*RUN_GAIN,walk:1.85,escape:20,notice:70*SIGHT_GAIN,
    presence:44,trace:30,radius:.37},
  {id:'giant',name:'巨人',count:2,scale:3,speed:CAR_SPEED*RUN_GAIN,walk:3.55,escape:10,notice:88*SIGHT_GAIN,
    presence:58,trace:36,radius:1.13},
  {id:'hollow',name:'虚ろ面',count:2,scale:3,face:0,size:4.6,hover:3.15,speed:13.5,walk:2.2,escape:16,notice:150,
    presence:84,trace:46,radius:1.42},
  {id:'skull',name:'髑髏面',count:2,scale:3,face:1,size:4.3,hover:3.0,speed:21,walk:3.1,escape:12,notice:165,
    presence:52,trace:34,radius:1.36},
  {id:'hannya',name:'般若面',count:2,scale:3,face:2,size:4.9,hover:3.3,speed:17,walk:2.7,escape:14,notice:190,
    presence:64,trace:40,radius:1.48}
];
export const ENEMY_TOTAL=enemyTypes.reduce((n,type)=>n+type.count,0);
// Creatures closer than this are simulated; the others wait where they stand.
export const ACTIVE_RANGE=262;
const LEASH=470,TRAIL_STEP=3.5,TRAIL_LIFE=75000,TRAIL_LENGTH=56,GRACE=2800;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(x,z,y)=>({x,z,y});
const stationary=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
const offsets=[
  [1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]
];
const haunts=[];
for(let i=0;i+2<(missionData.haunts?.length??0);i+=3)
  haunts.push({x:missionData.haunts[i],z:missionData.haunts[i+1],y:missionData.haunts[i+2]});

export function playerVisibility(enemy,player,terrain,sight,scale=enemy.scale){
  if(player.station||Math.abs(player.y-enemy.y)>35)return 'none';
  const head=[enemy.x,enemy.y+PLAYER_HEIGHT*scale*.93,enemy.z];
  const middle=player.y+(player.vehicle?.88:PLAYER_HEIGHT*.54);
  const half=player.vehicle?.82:.285,top=player.vehicle?1.34:PLAYER_HEIGHT*.985;
  const distance=dist(enemy,player)||1,dx=(player.z-enemy.z)*half/distance,dz=(enemy.x-player.x)*half/distance;
  const points=[[player.x,player.y+top,player.z],[player.x,player.y+.30,player.z],
    [player.x,middle,player.z],[player.x+dx,middle,player.z+dz],[player.x-dx,middle,player.z-dz]];
  let open=0,unknown=0;
  for(const p of points){
    if(terrain.terrainOccludes(head,p))continue;
    const solid=sight.blocked(head,p);
    if(solid===null)unknown++;
    else if(!solid)open++;
  }
  return open===points.length?'full':open?'partial':unknown?'unknown':'none';
}

function floor(terrain,sight,type,x,z){
  const y=terrain.support(x,z);
  if(y===null)return null;
  if(type.scale===1)return y;
  for(const d of stationary){
    const h=terrain.support(x+d.x*type.radius,z+d.z*type.radius,y);
    if(h===null||Math.abs(h-y)>1.02)return null;
  }
  const a=[x,y+.72,z],b=[x,y+PLAYER_HEIGHT*type.scale,z];
  return sight.blocked(a,b,type.radius*.76)===false?y:null;
}

function walkable(a,b,terrain,sight,type){
  const len=dist(a,b),steps=Math.max(1,Math.ceil(len/.75));
  let previous=a.y;
  for(let j=1;j<=steps;j++){
    const t=j/steps,y=floor(terrain,sight,type,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
    if(y===null||Math.abs(y-previous)>.85)return false;
    previous=y;
  }
  return true;
}

function route(from,goal,terrain,sight,type){
  const spacing=2.6;
  const stop=Math.min(type.scale===1?24:36,dist(from,goal));
  const angle=Math.atan2(goal.x-from.x,goal.z-from.z);
  goal=point(from.x+stop*Math.sin(angle),from.z+stop*Math.cos(angle),goal.y);
  if(walkable(from,goal,terrain,sight,type))return [goal];
  const key=(i,j)=>i+','+j,origin={i:0,j:0,x:from.x,z:from.z,y:from.y,length:0,score:stop};
  const frontier=[origin],best=new Map([[key(0,0),0]]);
  let nearest=origin,remaining=stop;
  for(let pass=0;frontier.length&&pass<130;pass++){
    frontier.sort((a,b)=>b.score-a.score);
    const node=frontier.pop(),left=dist(node,goal);
    if(left<remaining){nearest=node;remaining=left;}
    if(left<spacing)break;
    for(const [di,dj] of offsets){
      const i=node.i+di,j=node.j+dj,length=node.length+spacing*Math.hypot(di,dj),id=key(i,j);
      if(length>stop*2.1+10||length>=(best.get(id)??Infinity))continue;
      const x=origin.x+i*spacing,z=origin.z+j*spacing,y=floor(terrain,sight,type,x,z);
      if(y===null||!walkable(node,point(x,z,y),terrain,sight,type))continue;
      best.set(id,length);
      const score=length+1.22*dist(point(x,z,y),goal);
      frontier.push({i,j,x,z,y,length,score,parent:node});
    }
  }
  const path=[];
  while(nearest.parent){path.unshift(nearest);nearest=nearest.parent;}
  return path;
}

// Every game scatters the creatures over the road network: about half of them start
// somewhere in the city the player sets out from, the others anywhere in the world.
function scatter(origin,random){
  const homes=[],local=haunts.filter(h=>dist(h,origin)>150&&dist(h,origin)<680);
  const far=haunts.filter(h=>dist(h,origin)>150);
  for(let index=0;index<ENEMY_TOTAL;index++){
    let chosen=null;
    for(let attempt=0;attempt<80&&!chosen;attempt++){
      const pool=random()<.5&&local.length?local:far;
      const candidate=pool[Math.floor(random()*pool.length)];
      if(candidate&&homes.every(home=>dist(home,candidate)>46))chosen=candidate;
    }
    // Without baked road data (a damaged build) the creatures still appear, around the start.
    chosen??={x:origin.x+Math.cos(index*2.4)*(170+index*23),z:origin.z+Math.sin(index*2.4)*(170+index*23),y:null};
    homes.push(chosen);
  }
  // Shuffle so the kinds are spread evenly between the near and the far homes.
  for(let i=homes.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [homes[i],homes[j]]=[homes[j],homes[i]];
  }
  return homes;
}
function patrolAround(home,random){
  const near=haunts.filter(h=>h!==home&&dist(h,home)>14&&dist(h,home)<120);
  const stops=[[home.x,home.z]];
  for(let i=0;i<3&&near.length;i++){
    const [next]=near.splice(Math.floor(random()*near.length),1);
    stops.push([next.x,next.z]);
  }
  return stops;
}
const finite=(...values)=>values.every(Number.isFinite);
function restore(saved){
  if(saved?.v!==2||!Array.isArray(saved.actors)||saved.actors.length!==ENEMY_TOTAL)return null;
  for(const a of saved.actors){
    if(!a||!finite(a.x,a.z)||!Array.isArray(a.patrol)||!a.patrol.length||
      !a.patrol.every(p=>Array.isArray(p)&&finite(p[0],p[1])))return null;
  }
  return saved.actors;
}

export function createPursuit(sight,saved=null,{origin={x:0,z:0},random=Math.random}={}){
  let age=0,crumb=0;
  const trail=[];
  const previous=restore(saved),homes=previous?null:scatter(origin,random);
  const actors=[];
  for(const type of enemyTypes)for(let k=0;k<type.count;k++){
    const index=actors.length,old=previous?.[index],home=homes?.[index];
    actors.push({...type,kind:type.id,id:type.id+'-'+k,index,
      x:old?.x??home.x,z:old?.z??home.z,y:finite(old?.y)?old.y:null,
      patrol:old?.patrol??patrolAround(home,random),
      waypoint:Number.isInteger(old?.waypoint)?old.waypoint%(old.patrol.length):0,
      alerted:old?.alerted===true,yaw:finite(old?.yaw)?old.yaw:random()*Math.PI*2-Math.PI,
      lastSeen:old?.lastSeen&&finite(old.lastSeen.x,old.lastSeen.z)?old.lastSeen:null,
      walked:finite(old?.walked)?old.walked:0,
      stun:finite(old?.stun)?clamp(old.stun,0,RD2.stunMs):0,hits:Number.isInteger(old?.hits)?clamp(old.hits,0,RD2.stunHits-1):0,
      mode:old?.alerted===true?'chase':'patrol',scent:-1,lost:0,
      speedNow:0,route:[],planAt:index*67,lookAt:index*31,settleAt:0});
  }
  for(const actor of actors)if(actor.alerted&&!actor.lastSeen){actor.alerted=false;actor.mode='patrol';}

  function leaveTrail(player){
    while(trail.length&&(age-trail[0].t>TRAIL_LIFE||trail.length>TRAIL_LENGTH))trail.shift();
    if(player.station)return;
    const last=trail.at(-1);
    if(last&&Math.hypot(last.x-player.x,last.z-player.z)<TRAIL_STEP&&Math.abs(last.y-player.y)<2.5){last.t=age;return;}
    trail.push({n:crumb++,x:player.x,z:player.z,y:player.y,t:age});
  }
  const footprint=n=>{
    const first=trail[0];
    return first&&n>=first.n?trail[n-first.n]??null:first??null;
  };
  // The freshest footprint within reach of the creature.
  function pickScent(actor){
    for(let i=trail.length-1;i>=0;i--){
      const c=trail[i];
      if(Math.abs(c.y-actor.y)<9&&dist(c,actor)<=actor.trace)return c.n;
    }
    return -1;
  }
  function nearestFootprint(place){
    let best=-1,range=Infinity;
    for(const c of trail){
      const d=dist(c,place);
      if(d<range){range=d;best=c.n;}
    }
    return best;
  }
  function settle(actor,terrain){
    actor.y=floor(terrain,sight,actor,actor.x,actor.z);
    if(actor.y!==null||age<actor.settleAt)return;
    actor.settleAt=age+650;
    if(terrain.support(actor.x,actor.z)===null&&[6,-6].every(d=>terrain.support(actor.x+d,actor.z+d)===null))return;
    for(let ring=2;ring<=16;ring+=2)for(let k=0;k<8;k++){
      const a=k*Math.PI/4+ring,x=actor.x+Math.cos(a)*ring,z=actor.z+Math.sin(a)*ring;
      const y=floor(terrain,sight,actor,x,z);
      if(y!==null){Object.assign(actor,{x,y,z});return;}
    }
  }
  function alert(actor,player){
    actor.alerted=true;actor.mode='chase';actor.planAt=0;actor.lost=0;
    actor.lastSeen=point(player.x,player.z,player.y);
  }
  function calm(actor){
    actor.alerted=false;actor.lastSeen=null;actor.mode='patrol';actor.scent=-1;actor.lost=0;actor.planAt=0;
  }

  function step(player,terrain,ms){
    age+=ms;
    leaveTrail(player);
    let captured=null,plans=0;
    for(const actor of actors){
      if(actor.stun>0){
        // A creature restored while knocked out still has to find the ground it lies on.
        if(actor.y===null&&dist(actor,player)<=ACTIVE_RANGE)settle(actor,terrain);
        actor.stun=Math.max(0,actor.stun-ms);actor.speedNow=0;actor.route=[];
        if(!actor.stun){actor.hits=0;calm(actor);actor.lookAt=age+1200;}
        continue;
      }
      const gap=dist(actor,player),engaged=actor.alerted||actor.mode==='track';
      if(gap>ACTIVE_RANGE&&!engaged)continue;
      if(engaged&&gap>LEASH){calm(actor);continue;}
      if(actor.y===null)settle(actor,terrain);
      if(actor.y===null)continue;
      if(age>=actor.lookAt&&(engaged||gap<=Math.max(actor.notice,actor.presence))){
        actor.lookAt=age+104+actor.index%5*6;
        const visibility=gap<=actor.notice||actor.alerted?playerVisibility(actor,player,terrain,sight):'none';
        if(!actor.alerted&&age>GRACE&&gap<=actor.notice&&visibility==='full'){
          const yaw=Math.atan2(player.x-actor.x,actor.z-player.z);
          if(Math.cos(actor.yaw-yaw)>-.36||gap<9)alert(actor,player);
        }
        if(actor.alerted){
          if(gap>=actor.escape&&visibility==='none'){
            // Out of sight: fall back to the trail from where the player was last seen.
            const from=actor.lastSeen?nearestFootprint(actor.lastSeen):-1;
            calm(actor);
            if(from>=0){actor.mode='track';actor.scent=from;}
          }else if(visibility==='full'||visibility==='partial'){
            actor.lastSeen=point(player.x,player.z,player.y);
          }
        }else if(age>GRACE&&trail.length){
          const felt=!player.station&&gap<=actor.presence&&Math.abs(player.y-actor.y)<35;
          const found=felt?trail.at(-1).n:pickScent(actor);
          if(found>=0&&(actor.mode!=='track'||found>actor.scent)){
            if(actor.mode!=='track')actor.planAt=0;
            actor.mode='track';actor.scent=found;actor.lost=0;
          }
        }
      }
      let goal=null;
      if(actor.alerted)goal=actor.lastSeen;
      else if(actor.mode==='track'){
        let mark=footprint(actor.scent);
        while(mark&&dist(actor,mark)<actor.radius+2.1){
          const next=footprint(mark.n+1);
          if(!next||next===mark){mark=null;break;}
          mark=next;actor.scent=next.n;actor.planAt=Math.min(actor.planAt,age+90);
        }
        if(mark){goal=mark;actor.scent=mark.n;actor.lost=0;}
        else{
          // The trail went cold. Wait a moment for a fresh trace before giving up.
          actor.lost+=ms;
          if(actor.lost>5200||!trail.length)calm(actor);
        }
      }
      if(!actor.alerted&&actor.mode==='patrol'&&actor.patrol.length>1){
        const [x,z]=actor.patrol[actor.waypoint];
        goal=point(x,z,0);
        if(dist(actor,goal)<1.9+actor.radius){
          actor.waypoint=(actor.waypoint+1)%actor.patrol.length;actor.planAt=0;
          const [nx,nz]=actor.patrol[actor.waypoint];
          goal=point(nx,nz,0);
        }
      }
      if(goal&&age>=actor.planAt&&plans<1){
        plans++;
        actor.route=route(actor,goal,terrain,sight,actor);
        actor.planAt=age+(actor.alerted?310:actor.mode==='track'?430:830)+actor.index*3;
        // A patrol stop that cannot be reached is skipped.
        if(!actor.route.length&&actor.mode==='patrol')actor.waypoint=(actor.waypoint+1)%actor.patrol.length;
      }
      if(!goal)actor.route=[];
      const target=actor.route[0];
      const shift=ms/1000;
      const pace=actor.alerted?actor.speed:actor.mode==='track'?Math.max(actor.walk*2,actor.speed*.5):actor.walk;
      actor.speedNow+=clamp((target?pace:0)-actor.speedNow,-35*shift,35*shift);
      if(target){
        const distance=dist(actor,target),angle=Math.atan2(target.x-actor.x,actor.z-target.z);
        actor.yaw+=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw))*Math.min(1,shift*13);
        const delta=Math.min(distance,actor.speedNow*shift);
        const x=actor.x+Math.sin(angle)*delta,z=actor.z-Math.cos(angle)*delta,y=floor(terrain,sight,actor,x,z);
        if(y!==null&&Math.abs(y-actor.y)<1.15){
          Object.assign(actor,{x,y,z,walked:actor.walked+delta});
          if(distance<=delta+.05)actor.route.shift();
        }else{actor.route=[];actor.planAt=Math.min(actor.planAt,age+120);}
      }else if(actor.face!==undefined&&gap<actor.notice&&engaged){
        // A face that has stopped keeps staring at where it believes the player is.
        const angle=Math.atan2(player.x-actor.x,actor.z-player.z);
        actor.yaw+=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw))*Math.min(1,shift*4);
      }
      if(actor.alerted&&!player.station&&dist(actor,player)<actor.radius+.51&&Math.abs(player.y-actor.y)<1.6){
        const visible=playerVisibility(actor,player,terrain,sight);
        if(visible==='full'||visible==='partial')captured=actor.name;
      }
    }
    return captured;
  }

  // The first creature a round meets between a and b: {actor, t}.
  function struck(a,b){
    let first=null;
    const minX=Math.min(a[0],b[0])-4,maxX=Math.max(a[0],b[0])+4,minZ=Math.min(a[2],b[2])-4,maxZ=Math.max(a[2],b[2])+4;
    for(const actor of actors){
      if(actor.y===null||actor.x<minX||actor.x>maxX||actor.z<minZ||actor.z>maxZ)continue;
      let t;
      if(actor.face!==undefined){
        const down=actor.stun>0?actor.hover-actor.size*.42:0;
        t=segmentHitsSphere(a,b,[actor.x,actor.y+actor.hover-down,actor.z],actor.size*.47);
      }else if(actor.stun>0){
        t=segmentHitsSphere(a,b,[actor.x,actor.y+.35*actor.scale,actor.z],.62*actor.scale);
      }else t=segmentHitsCapsule(a,b,[actor.x,actor.y,actor.z],PLAYER_HEIGHT*actor.scale,.33*actor.scale);
      if(t!==null&&(!first||t<first.t))first={actor,t};
    }
    return first;
  }
  // Twenty hits knock a creature out for three minutes. A hit also tells it where the shot came from.
  function wound(actor,player){
    if(actor.stun>0)return {id:actor.id,name:actor.name,hits:RD2.stunHits,stunned:false,down:true};
    actor.hits++;
    if(actor.hits>=RD2.stunHits){
      actor.hits=0;actor.stun=RD2.stunMs;calm(actor);actor.speedNow=0;actor.route=[];
      return {id:actor.id,name:actor.name,hits:RD2.stunHits,stunned:true,down:true};
    }
    if(!player.station&&!actor.alerted)alert(actor,player);
    return {id:actor.id,name:actor.name,hits:actor.hits,stunned:false,down:false};
  }
  // Millimetres are enough for drawing, and they keep the state sent to the browser short.
  const short=n=>n===null?null:Math.round(n*1000)/1000;
  const view=()=>actors.map(({id,kind,name,x,y,z,yaw,scale,alerted,mode,speedNow,walked,stun,hits,face,size,hover})=>
    ({id,kind,name,x:short(x),y:short(y),z:short(z),yaw:short(yaw),scale,alerted,mode,speedNow:short(speedNow),
      walked:short(walked),stun:Math.round(stun),hits,face,size,hover}));
  const save=()=>({v:2,actors:actors.map(({x,y,z,yaw,alerted,walked,waypoint,lastSeen,patrol,stun,hits})=>
    ({x,y,z,yaw,alerted,walked,waypoint,lastSeen,patrol,stun:Math.round(stun),hits}))});
  // Places where the world has to be loaded for creatures that are on the move.
  const hunters=()=>actors.filter(a=>a.stun<=0&&(a.alerted||a.mode==='track')).map(({x,z})=>({x,z}));
  return {step,view,save,struck,wound,hunters,trail:()=>trail.map(({x,y,z})=>({x,y,z}))};
}
