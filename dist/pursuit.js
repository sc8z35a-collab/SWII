import {PLAYER_HEIGHT} from './mission-layout.js';
import {CAR_SPEED} from './driving.js';

const types=[
  {id:'pursuer',name:'追跡者',scale:1,speed:18.5,escape:20,notice:70,radius:.37,
    patrol:[[-121,1247],[-139,1245],[-153,1242],[-134,1246]]},
  {id:'giant',name:'巨人',scale:3,speed:CAR_SPEED,escape:10,notice:88,radius:1.13,
    patrol:[[-51,1230],[-40,1214],[-30,1211],[-17,1210]]}
];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(x,z,y)=>({x,z,y});
const stationary=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
const offsets=[
  [1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]
];

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

export function createPursuit(sight,saved=[]){
  let age=0;
  const actors=types.map((type,i)=>{
    const [x,z]=type.patrol[0],previous=saved?.[i];
    return {...type,x:previous?.x??x,z:previous?.z??z,y:previous?.y??null,waypoint:previous?.waypoint??1,
      alerted:previous?.alerted===true,yaw:previous?.yaw??0,lastSeen:previous?.lastSeen??null,walked:previous?.walked??0,
      speedNow:0,route:[],planAt:0,lookAt:0};
  });
  function step(player,terrain,ms){
    age+=ms;
    let captured=null;
    for(const actor of actors){
      const gap=dist(actor,player);
      if(gap>175&&!actor.alerted)continue;
      actor.y??=floor(terrain,sight,actor,actor.x,actor.z);
      if(actor.y===null)continue;
      if(age>=actor.lookAt&&(actor.alerted||gap<=actor.notice)){
        actor.lookAt=age+92;
        const visibility=playerVisibility(actor,player,terrain,sight);
        if(!actor.alerted&&age>2800&&gap<=actor.notice&&visibility==='full'){
          const yaw=Math.atan2(player.x-actor.x,actor.z-player.z);
          if(Math.cos(actor.yaw-yaw)>-.36||gap<9){
            actor.alerted=true;actor.planAt=0;
          }
        }
        if(actor.alerted){
          if(gap>=actor.escape&&visibility==='none'){
            actor.alerted=false;actor.lastSeen=null;actor.planAt=0;
          }else if(visibility==='full'||visibility==='partial'){
            actor.lastSeen=point(player.x,player.z,player.y);
          }
        }
      }
      const [x,z]=actor.patrol[actor.waypoint];
      const patrol=point(x,z,0);
      if(!actor.alerted&&dist(actor,patrol)<1.9){
        actor.waypoint=(actor.waypoint+1)%actor.patrol.length;actor.planAt=0;
      }
      const goal=actor.alerted?actor.lastSeen:patrol;
      if(goal&&age>=actor.planAt){
        actor.route=route(actor,goal,terrain,sight,actor);
        actor.planAt=age+(actor.alerted?310:830);
      }
      const target=actor.route[0];
      const shift=ms/1000;
      const pace=actor.alerted?actor.speed:actor.scale===1?1.85:3.55;
      actor.speedNow+=clamp((target?pace:0)-actor.speedNow,-35*shift,35*shift);
      if(target){
        const distance=dist(actor,target),angle=Math.atan2(target.x-actor.x,actor.z-target.z);
        actor.yaw+=Math.atan2(Math.sin(angle-actor.yaw),Math.cos(angle-actor.yaw))*Math.min(1,shift*13);
        const delta=Math.min(distance,actor.speedNow*shift);
        const x=actor.x+Math.sin(angle)*delta,z=actor.z-Math.cos(angle)*delta,y=floor(terrain,sight,actor,x,z);
        if(y!==null&&Math.abs(y-actor.y)<1.15){
          Object.assign(actor,{x,y,z,walked:actor.walked+delta});
          if(distance<=delta+.05)actor.route.shift();
        }else{actor.route=[];actor.planAt=0;}
      }
      if(actor.alerted&&!player.station&&dist(actor,player)<actor.radius+.51&&Math.abs(player.y-actor.y)<1.6){
        const visible=playerVisibility(actor,player,terrain,sight);
        if(visible==='full'||visible==='partial')captured=actor.name;
      }
    }
    return captured;
  }
  const view=()=>actors.map(({id,name,x,y,z,yaw,scale,alerted,speedNow,walked})=>({id,name,x,y,z,yaw,scale,alerted,speedNow,walked}));
  const save=()=>actors.map(({x,y,z,yaw,alerted,walked,waypoint,lastSeen})=>({x,y,z,yaw,alerted,walked,waypoint,lastSeen}));
  return {step,view,save};
}
