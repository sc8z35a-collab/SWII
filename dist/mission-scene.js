import {normalize,vectorCross} from './vector.js';
import {meshFrame,drawCar} from './moving-models.js';
import {humanInstance} from './people.js';
import {DUST,EXHAUST,HEAT_METAL,IGNITION,LEATHER,LIFT_MATERIAL_OFFSET,PAPER,SHIELD_TILE,SHOCK,SOOT,SPIRIT} from './architecture-materials.js';
import {CANNON_DROP,CANNON_PITCH,EVACUATION_MS,launchHeight,launchSite} from './mission-layout.js';
import {missionData} from './mission-data.js';
import {withDeadline} from './network.js';
import {WORLD_VERSION} from './geography.js';
import {RD2} from './ballistics.js';

const {x,z,half,engines}=launchSite;
const floor=missionData.padFloor;
const down=[[1,0,0],[0,-1,0],[0,0,-1]];
const palettes=['642d2b','24453b','283c57','77503a','5b344c','36485b','313c32'];
const black='282b2c',metal='717777',stone='848885';
const elev=(dx,dy,dz)=>[x+dx,floor+dy,z+dz];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{const a=clamp(t);return a*a*(3-2*a);};
const color=hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const vector=(a,b)=>b.map((n,i)=>n-a[i]);
const add=(a,b,t=1)=>a.map((n,i)=>n+b[i]*t);
const delta=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const tilt=(direction)=>({yaw:Math.atan2(direction[0],-direction[2]),pitch:Math.atan2(direction[1],Math.hypot(direction[0],direction[2]))});
const cache=new Map();
const rgb=hex=>{if(!cache.has(hex))cache.set(hex,color(hex));return cache.get(hex);};
const noise=(n)=>{const value=Math.sin(n*91.192+13.7)*19857.7413;return value-Math.floor(value);};
let assembly=null,assemblyJob=null;
export function requestLaunchAssembly(){
  if(assembly)return Promise.resolve(assembly);
  assemblyJob??=withDeadline(12000,async signal=>{
    const res=await fetch('./world/'+WORLD_VERSION+'/tower-assembly.json',{signal});
    if(!res.ok)throw Error('Tower assembly unavailable');
    assembly=await res.json();return assembly;
  }).catch(error=>{assemblyJob=null;throw error;});
  return assemblyJob;
}
function part(meshes,kind,position,w,h,d,paint,mat,axes=[[1,0,0],[0,1,0],[0,0,1]]){
  (meshes[kind]??=[]).push(...position,...axes[0].map(n=>n*w),...axes[1].map(n=>n*h),...axes[2].map(n=>n*d),...rgb(paint),mat);
}
function beam(meshes,a,b,w,d,paint,material){
  const up=normalize(vector(a,b)),right=normalize(vectorCross(up,Math.abs(up[1])>.95?[0,0,1]:[0,1,0]));
  const back=vectorCross(right,up);
  part(meshes,'box',add(a,vector(a,b),.5),w,delta(a,b),d,paint,material,[right,up,back]);
}
function label(meshes,x,y,z,angle,number){
  const frame=meshFrame(meshes,{x,y,z,yaw:angle});
  const segments=[[0,.19,.24,.032],[-.12,.095,.031,.145],[.12,.095,.031,.145],
    [0,0,.24,.032],[-.12,-.095,.031,.145],[.12,-.095,.031,.145],[0,-.19,.24,.032]];
  const digits=[[0,1,2,4,5,6],[2,5],[0,2,3,4,6],[0,2,3,5,6],[1,2,3,5],[0,1,3,5,6],
    [0,1,3,4,5,6],[0,2,5],[0,1,2,3,4,5,6],[0,1,2,3,5,6]];
  for(const [i,digit] of String(number).padStart(2,'0').split('').entries())
    for(const [s,h,w,depth] of digits[+digit].map(j=>segments[j]))
      frame.part('box',s+(i-.5)*.34,h,.015,w,depth,.032,'d5b674',SHIELD_TILE+LIFT_MATERIAL_OFFSET);
}
function drawBook(meshes,book,now){
  const open=book.id%4===2,frame=meshFrame(meshes,{...book,y:book.y+.065,yaw:book.yaw,pitch:open?.07:.12});
  const m=frame.part,text=palettes[book.id%palettes.length];
  m('chamfer',0,.037,0,.36,.085,.49,'dfd3ac',PAPER);
  for(const q of [-1,1])m('chamfer',0,.038+q*.046,0,.391,.018,.515,text,LEATHER);
  m('tube',-.179,.037,0,.106,.518,.104,text,LEATHER,[frame.right,frame.forward,frame.up]);
  for(const b of [-.17,0,.17]){
    m('box',-.181,.083,b,.062,.011,.014,'be9c5e',HEAT_METAL);
    for(const a of [-.133,.138])m('box',a,.088,b,.006,.006,.048,'aa894d',HEAT_METAL);
  }
  for(const b of [-.204,.204])m('box',0,.086,b,.279,.004,.007,'b39965',HEAT_METAL);
  m('box',.043,.088,.056,.168,.004,.008,'c6ad72',HEAT_METAL);
  m('box',.043,.088,.014,.113,.004,.006,'aa8f62',HEAT_METAL);
  m('box',.118,.013,-.243,.031,.013,.141,'963e3b',LEATHER);
  if(open)m('chamfer',.07,.090,-.003,.235,.014,.41,'e3d6af',PAPER);
  m('ball',.025,.147,.01,.037*(1+Math.sin(now*5)*.23),.037,.037,'f8cc74',IGNITION);
}
// 0 while standing, 1 while knocked out; the fall and the recovery each take under a second.
const collapse=actor=>actor.stun>0?Math.min(clamp((RD2.stunMs-actor.stun)/650),clamp(actor.stun/900)):0;
function stunMarks(effects,actor,clock,height){
  // Three slow lights circle a creature that is out cold; they blink before it wakes.
  const waking=actor.stun<12000?.5+.5*Math.sin(clock*9):1;
  for(let i=0;i<3;i++){
    const a=clock*2.1+i*2.094,r=(.34+.05*Math.sin(clock*3+i))*actor.scale;
    fume(effects,i,[actor.x+Math.sin(a)*r,actor.y+height+Math.sin(clock*2.6+i)*.06,actor.z+Math.cos(a)*r],
      .16*Math.sqrt(actor.scale),'bfe6ff',.78*waking,SPIRIT);
  }
}
function drawFace(meshes,effects,actor,clock){
  const down=smooth(collapse(actor)),size=actor.size??4.6,hover=actor.hover??3.1,seed=noise(actor.id.length*7.3+(actor.id.charCodeAt(actor.id.length-1)||0));
  const alert=actor.alerted?1:actor.mode==='track'?.45:0;
  const y=actor.y+mix(hover,size*.2,down);
  if(down>.4)stunMarks(effects,{...actor,scale:size*.55},clock,size*.62);
  if(meshes.detailed){
    const jaw=down>0?mix(.1,.75,down):alert>.9?.5+.32*Math.sin(clock*5.3+seed*9):.1+.06*Math.sin(clock*.8+seed*5)+alert*.2;
    (meshes.faces??=[]).push(actor.x,y,actor.z,actor.yaw,size,actor.face,alert,down,jaw,
      -1.32*down,.22*down,seed,clamp((actor.hits??0)/RD2.stunHits),0,0,0);
    return;
  }
  // Plain shapes for the software renderer: a head, two hollow eyes and a mouth.
  const frame=meshFrame(meshes,{x:actor.x,y,z:actor.z,yaw:actor.yaw,pitch:-1.32*down});
  const m=(kind,a,h,b,w,H,d,paint,mat=0)=>frame.part(kind,a*size,h*size,b*size,w*size,H*size,d*size,paint,mat);
  const skin=['d9d5c8','c4b890','8a1a15'][actor.face]??'d9d5c8';
  m('ball',0,.03,0,.76,1.0,.62,skin,57);
  for(const side of [-1,1]){
    m('ball',side*.15,.08,.25,.18,actor.face===0?.07:.2,.12,'0c0b0c',SOOT);
    m('ball',side*.15,.08,.3,.05,.05,.04,actor.alerted?'ff5038':'f3e9c8',actor.alerted?IGNITION:7);
    if(actor.face===2)m('cone',side*.25,.58,.02,.12,.44,.12,'3a1c14',LEATHER);
  }
  m('box',0,-.27,.27,.4,actor.face===0?.035:.09,.06,'0c0a0b',SOOT);
  for(let i=-3;i<=3;i++)m('box',i*.05,-.25,.3,.03,.05,.02,actor.face===0?'18171a':'e2dcc4',PAPER);
}
function drawEnemy(meshes,effects,actor,clock){
  if(actor.face!==undefined){drawFace(meshes,effects,actor,clock);return;}
  const {scale,walked,speedNow,alerted}=actor,down=collapse(actor);
  if(down>.4)stunMarks(effects,actor,clock,.75*scale);
  const tracking=actor.mode==='track';
  if(meshes.detailed){
    const stride=alerted?2.55:tracking?1.7:1.16;
    (meshes.humans??=[]);
    humanInstance(meshes.humans,{x:actor.x,y:actor.y,z:actor.z,yaw:actor.yaw,scale,build:scale>1?1.12:1.04,
      phase:walked/(stride*scale)*Math.PI*2,gait:down>0?0:clamp(speedNow/(scale*1.6)),stride,reach:0,
      skin:scale>1?'8b8f7d':'aaa797',hair:'1d1f1f',top:scale>1?'515c59':'2a3539',bottom:scale>1?'303b3d':'283234',
      shoe:'1a1c1d',style:(2<<8)|1|32|(alerted?16:0)|(down>.5?64:0)});
    return;
  }
  const jacket=scale>1?'515c59':'2a3539',cloth=scale>1?'303b3d':'283234',face=scale>1?'8b8f7d':'aaa797';
  if(down>.5){
    // Knocked out: the figure lies on its back.
    const lying=meshFrame(meshes,{...actor,y:actor.y+.13*scale});
    const flat=(kind,a,h,b,w,y,d,c,mat=0)=>lying.part(kind,a*scale,h*scale,b*scale,w*scale,y*scale,d*scale,c,mat);
    flat('chamfer',0,0,-.62,.5,.24,.62,jacket,41);
    flat('chamfer',0,0,-1.42,.36,.2,.86,cloth,41);
    flat('ball',0,.03,-.14,.24,.23,.28,face,57);
    for(const side of [-1,1])flat('chamfer',side*.36,-.03,-.7,.14,.13,.66,jacket,41);
    return;
  }
  const stride=scale*(alerted?2.55:tracking?1.7:1.16),cycle=walked/stride*2*Math.PI;
  const weight=clamp(speedNow/(scale*2.2)),drive=Math.sin(cycle)*weight,breath=Math.sin(clock*2.4)*.009;
  const model=meshFrame(meshes,{...actor,y:actor.y+scale*(Math.abs(Math.sin(cycle))*.034*weight+breath)});
  const {point,part:m}=model;
  const paint=(kind,a,h,b,w,y,d,c,mat=0)=>m(kind,a*scale,h*scale,b*scale,w*scale,y*scale,d*scale,c,mat);
  const limb=(a,b,w,c,mat)=>beam(meshes,point(...a.map(v=>v*scale)),point(...b.map(v=>v*scale)),w*scale,w*.83*scale,c,mat);
  const lean=alerted?.17:.013;
  paint('taper',0,1.234,lean*.55,.53,.54,.28,jacket,41);
  paint('chamfer',0,.936,0,.378,.19,.26,cloth,41);
  paint('chamfer',0,1.44,lean*.97,.335,.155,.28,jacket,41);
  paint('ball',0,1.567,lean*1.13,.237,.286,.231,face,57);
  paint('chamfer',0,1.644,lean*1.13-.027,.230,.120,.236,jacket,41);
  paint('box',0,1.580,lean*1.13+.113,.190,.046,.026,'292e2c',LEATHER);
  paint('box',0,1.20,lean*.56+.15,.068,.36,.015,'8a8167',25);
  for(const side of [-1,1]){
    const t=side*drive,f=side*Math.cos(cycle)*weight;
    const hip=[side*.113,.94,0],knee=[side*.12,.51,t*.235+.041],ankle=[side*.115,.08+Math.max(0,f)*.18,t*.46];
    const shoulder=[side*.239,1.424,lean*.8],elbow=[side*.306,1.168,-t*.125-.08],hand=[side*.29,alerted?1.223:.969,-t*.25+(alerted?.22:.035)];
    limb(hip,knee,.164,cloth,41);limb(knee,ankle,.128,jacket,41);
    limb(shoulder,elbow,.139,jacket,41);limb(elbow,hand,.096,cloth,41);
    paint('ball',hand[0],hand[1],hand[2],.09,.12,.079,face,57);
    paint('chamfer',ankle[0],ankle[1]-.025,t*.46+.058,.16,.116,.32,'24282a',42);
    paint('ball',side*.050,1.589,lean*1.13+.126,.026,.015,.010,alerted?'ff5842':'ad8060',alerted?IGNITION:25);
    paint('box',side*.125,1.29,lean+.075,.097,.108,.035,'7d7b68',LEATHER);
  }
}
// An olive ammunition tin with a stencilled band, a carrying handle and loose cartridges on the lid.
function drawAmmo(meshes,effects,drop,clock,low){
  const fall=clamp(1-drop.age/900),height=14*fall*fall,settle=drop.age>900?Math.exp(-(drop.age-900)/90)*Math.sin((drop.age-900)/38)*.05:0;
  const frame=meshFrame(meshes,{x:drop.x,y:drop.y+height+Math.max(0,settle)+.004,z:drop.z,yaw:drop.id*2.4+fall*5,pitch:fall*.8}),m=frame.part;
  m('chamfer',0,.105,0,.34,.2,.19,'4c5a3a',HEAT_METAL);
  m('chamfer',0,.215,0,.352,.03,.2,'3f4b31',HEAT_METAL);
  m('box',0,.105,.0965,.25,.062,.004,'d8c070',PAPER);
  m('box',0,.105,-.0965,.25,.062,.004,'d8c070',PAPER);
  for(const a of [-.07,-.025,.02,.065,.11])m('box',a,.105,.099,.012,.04,.003,'2b2e22',SOOT);
  for(const side of [-1,1]){
    m('box',side*.176,.15,0,.012,.07,.06,'8d8f86',HEAT_METAL);
    m('box',side*.09,.255,0,.014,.05,.014,'2a2c28',LEATHER);
  }
  m('box',0,.283,0,.2,.014,.022,'2a2c28',LEATHER);
  if(!low)for(let i=0;i<3;i++){
    const a=-.1+i*.05,b=.05-i*.03;
    m('tube',a,.238,b,.012,.021,.012,'c9a24a',HEAT_METAL,[frame.right,frame.forward,frame.up]);
    m('cone',a,.238,b+.016,.0115,.012,.0115,'b87a45',HEAT_METAL,[frame.right,frame.forward,frame.up]);
  }
  if(fall>0){
    streak(effects,[drop.x,drop.y+height+.3,drop.z],[drop.x,drop.y+height+2.6,drop.z],.16,.5*fall,SPIRIT,'ffe7a8');
  }else{
    const pulse=.75+.25*Math.sin(clock*4.2+drop.id);
    fume(effects,drop.id,[drop.x,drop.y+.62,drop.z],.3*pulse,'ffd98a',.62,SPIRIT);
    if(drop.age<1500)fume(effects,drop.id+9,[drop.x,drop.y+.12,drop.z],.5+(drop.age-900)/400,'b4a78e',(1-(drop.age-900)/600)*.5,DUST);
  }
}
function drawBullet(effects,bullet){
  const speed=Math.hypot(bullet.vx,bullet.vy,bullet.vz)||1,d=[bullet.vx/speed,bullet.vy/speed,bullet.vz/speed];
  const head=[bullet.x,bullet.y,bullet.z],length=Math.min(7.5,Math.max(.4,(bullet.age??0)*.001*speed));
  streak(effects,add(head,d,-length),head,.05,.95,IGNITION,'ffd9a0');
}
function impactEffects(effects,impact,low){
  const t=impact.age/1000,p=[impact.x,impact.y,impact.z];
  if(t<.09)fume(effects,impact.id,p,impact.flesh?.5:.34,impact.flesh?'ff6a52':'ffe1a6',.9*(1-t/.09),SPIRIT);
  const count=low?2:5;
  for(let i=0;i<count;i++){
    const a=i*2.399+impact.id,spread=(.25+noise(i+impact.id)*.9)*t;
    fume(effects,i+impact.id*7,[p[0]+Math.sin(a)*spread,p[1]+t*(.5+noise(i+3)*.9)-t*t*1.6,p[2]+Math.cos(a)*spread],
      .12+t*.9,impact.flesh?'5d2f2a':'b9b1a0',(1-t/.7)*.5,DUST);
  }
}
function copyAssembly(meshes,lift){
  if(!assembly)return;
  for(const [kind,data] of Object.entries(assembly)){
    if(!data.length)continue;
    const out=meshes[kind]??=[];
    for(let i=0;i<data.length;i+=16){
      const p=data.slice(i,i+16);p[1]+=lift;p[15]+=LIFT_MATERIAL_OFFSET;out.push(...p);
    }
  }
}
function makeFoundation(meshes,lift,close){
  const base=[x,floor+lift,z],m=(kind,a,b,c,w,h,d,paint,mat)=>part(meshes,kind,add(base,[a,b,c]),w,h,d,paint,mat+LIFT_MATERIAL_OFFSET);
  m('box',0,-.32,0,half*2,.62,half*2,'9b9b91',20);
  m('chamfer',0,-3.19,0,half*1.98,5.4,half*1.98,'555b59',SHIELD_TILE);
  m('chamfer',0,-6.2,0,half*1.77,2.24,half*1.77,'666e6b',SOOT);
  if(close){
    for(const s of [-1,1]){
      for(let i=-4;i<=4;i++){
        m('chamfer',i*12.1,-3,s*(half-1.7),10.4,4.0,4.1,stone,SHIELD_TILE);
        m('chamfer',s*(half-1.7),-3,i*12.1,4.1,4,10.4,stone,SHIELD_TILE);
        m('box',i*12.1,-.045,s*(half-2.5),9.6,.1,.122,'c6ac73',25);
      }
      for(const a of [9.5,24,38,51]){
        m('box',s*a,-7.2,0,1.3,2.7,95,black,HEAT_METAL);
        m('box',0,-7.46,s*a,96,2.21,1.3,metal,HEAT_METAL);
      }
    }
    for(const a of [-1,1])for(const c of [-1,1]){
      const p=add(base,[a*48,-6,c*46]),q=add(base,[a*14,-12,c*11]);
      beam(meshes,p,q,1.76,2.05,'5b6362',HEAT_METAL+LIFT_MATERIAL_OFFSET);
    }
  }
}
function drawShaft(meshes,lift,close){
  if(lift<.18)return;
  const bottom=-launchSite.depth,paint='656e6d',m=(kind,a,b,c,w,h,d,base,mat)=>part(meshes,kind,elev(a,b,c),w,h,d,base,mat);
  m('box',0,bottom-.35,0,half*2,.6,half*2,'4e5350',SOOT);
  for(const s of [-1,1]){
    m('box',s*(half+.05),bottom*.5,0,.24,-bottom,half*2,paint,SHIELD_TILE);
    m('box',0,bottom*.5,s*(half+.05),half*2,-bottom,.24,paint,SHIELD_TILE);
    if(!close)continue;
    for(let i=-4;i<=4;i++){
      m('chamfer',s*(half-.7),bottom*.5,i*12.1,1.5,-bottom,1.04,'7c827a',25);
      m('chamfer',i*12.1,bottom*.5,s*(half-.7),1.04,-bottom,1.5,'7c827a',25);
      m('box',s*(half-.04),-.36,i*12.1,.14,.68,4.1,'c9ad72',25);
      m('box',i*12.1,-.36,s*(half-.04),4.1,.68,.14,'c9ad72',25);
    }
  }
}
function drawEngine(meshes,effects,a,b,lift,thrust,clock,close,id){
  const at=(dx,dy,dz)=>elev(a+dx,dy+lift,b+dz);
  const m=(kind,dx,y,dz,w,h,d,paint,mat,axes=down)=>part(meshes,kind,at(dx,y,dz),w,h,d,paint,mat+LIFT_MATERIAL_OFFSET,axes);
  m('chamfer',0,-8.1,0,16.7,7.1,15,stone,SHIELD_TILE);
  m('tube',0,-10.34,0,13.1,6.4,13.1,'625d59',HEAT_METAL);
  m('tube',0,-13.85,0,13.4,1.71,13.4,'949291',HEAT_METAL);
  m('tube',0,-14.76,0,11.1,.48,11.1,'272a2e',SOOT);
  m('tube',0,-15.16,0,7.7,.64,7.7,'505252',HEAT_METAL);
  if(close){
    for(let q=0;q<12;q++){
      const angle=q*Math.PI/6,c=Math.cos(angle),s=Math.sin(angle);
      const axes=[[c,0,s],[0,1,0],[-s,0,c]];
      m('chamfer',c*6.14,-14.57,s*6.14,1.54,2.61,2.18,q%3===0?'8d786b':'68605c',HEAT_METAL,axes);
      m('tube',c*5.82,-15.42,s*5.82,.34,.4,.34,'aba9a3',25);
      m('chamfer',c*2.89,-15.58,s*2.89,3.82,.31,.49,q%2===0?'5d5f5d':'747c7c',HEAT_METAL,axes);
    }
    label(meshes,...at(0,-10.0,7.55),Math.PI,id+1);
  }
  if(thrust<.02)return;
  const pulse=.93+.07*Math.sin(clock*26+id*.67);
  m('tube',0,-15.58,0,4.3+2.6*thrust,.42,4.3+2.6*thrust,'ffc594',IGNITION);
  const length=thrust*(42+8.5*pulse);
  const end=at(Math.sin(clock*8+id)*1.65,-15.82-length,Math.cos(clock*7+id)*1.37);
  streak(effects,at(0,-15.77,0),end,12.2*Math.sqrt(thrust),.95,IGNITION,'ffb864');
}
function drawCannon(meshes,mission,close){
  const deployment=smooth((mission.lift-360)/340);
  if(!deployment)return;
  const y=floor+mission.lift-8.2-(CANNON_DROP-8.2)*deployment;
  const {part:m,right,up,back,forward}=meshFrame(meshes,{x,y,z,yaw:mission.aim??Math.PI,
    pitch:mix(-Math.PI/2,CANNON_PITCH,deployment)});
  const mat=HEAT_METAL+LIFT_MATERIAL_OFFSET,shield=SHIELD_TILE+LIFT_MATERIAL_OFFSET;
  m('chamfer',0,0,0,18.4,9.0,21.2,'586260',shield);
  for(const side of [-1,1]){
    m('chamfer',10.5*side,0,-2,4.3,7.2,14.2,'5a605f',shield);
    m('tube',side*8.1,0,.9,5.9,2.4,5.5,'7d807a',mat,[up,right,back.map(n=>-n)]);
  }
  const axes=[right,forward,up],barrel=8+12*deployment,flare=(mission.missiles??[]).some(m=>m.age<330);
  m('tube',0,0,barrel*.52,7.15,barrel,7.15,'4e5356',mat,axes);
  m('tube',0,0,barrel*.90,8.41,3,8.41,'777771',mat,axes);
  m('tube',0,0,barrel*.97,6.35,.28,6.35,'25292b',SOOT+LIFT_MATERIAL_OFFSET,axes);
  if(flare)m('tube',0,0,barrel,5.7,.32,5.7,'ffb560',IGNITION+LIFT_MATERIAL_OFFSET,axes);
  if(close)for(let i=0;i<8;i++){
    const s=Math.sin(i*Math.PI/4),c=Math.cos(i*Math.PI/4);
    m('chamfer',3.61*s,3.61*c,barrel*.56,.68,.68,barrel*.53,'91918a',mat);
  }
}
function drawMissile(meshes,effects,missile){
  const rotation=tilt(missile.direction),f=meshFrame(meshes,{...missile,...rotation}),{right,forward,up,part:m}=f;
  const axis=[right,forward,up],heat=HEAT_METAL+LIFT_MATERIAL_OFFSET,tile=SHIELD_TILE+LIFT_MATERIAL_OFFSET;
  m('tube',0,0,-.07,1.05,3.73,1.05,'989c94',tile,axis);
  m('cone',0,0,2.33,1.05,1.16,1.05,'c18355',heat,axis);
  m('tube',0,0,-1.75,1.08,.44,1.08,'736b63',heat,axis);
  for(let i=0;i<4;i++){
    const angle=i*Math.PI*.5,e=add(right.map(n=>n*Math.cos(angle)),up,Math.sin(angle));
    const t=normalize(vectorCross(forward,e));
    m('taper',Math.cos(angle)*.75,Math.sin(angle)*.75,-1.37,.64,.12,1.29,'596b6b',heat,[e,t,f.back]);
  }
  m('tube',0,0,-2.05,.78,.15,.78,'fff0be',IGNITION,axis);
  streak(effects,f.point(0,0,-2.0),f.point(0,0,-7.3),1.66,.97,IGNITION,'ffb864');
}
function fume(effects,id,point,size,paint,alpha,kind){
  if(alpha>.012)effects.push({id,point,size,paint,alpha:Math.min(.98,alpha),kind});
}
function streak(effects,start,end,width,alpha,kind,paint){
  effects.push({point:add(start,vector(start,end),.5),size:width,length:delta(start,end),
    axis:normalize(vector(start,end)),paint,alpha,kind});
}
function launchEffects(effects,mission,thrust,now,low){
  if(mission.phase==='books'||mission.phase==='escaped')return;
  const ev=mission.phase==='evacuate'?mission.elapsed/1000:14;
  if(ev<9.6&&mission.phase==='evacuate'){
    const age=mission.elapsed/1000;
    for(let i=0;i<(low?16:34);i++){
      const t=clamp((age-noise(i)*1.7)/4);
      const a=i*2.399,rad=1+noise(i+8)*5+t*7,px=launchSite.gate.x+Math.sin(a)*rad,pz=launchSite.gate.z+Math.cos(a)*rad;
      fume(effects,i,[px,floor+.3+(t*2.5+noise(i+3)*3.7)*t,pz],.10+noise(i+14)*.61,'e9d6ab',(1-t)*t*.67,SPIRIT);
    }
    for(const actor of mission.releases??[]){
      if(Math.hypot(actor.x-x,actor.z-z)>420)continue;
      for(let i=0;i<(low?9:21);i++){
        const t=clamp((age-noise(i+5)*1.05)/3.0),a=i*2.399+t*3.85,r=(.17+t*t*1.22)*actor.scale;
        const p=[actor.x+Math.sin(a)*r,actor.y+(.25+noise(i+9)*1.33+t*t*5.0)*actor.scale,actor.z+Math.cos(a)*r];
        fume(effects,i,p,(.10+noise(i+11)*.45)*actor.scale,'a9d9e2',(1-t)*smooth(age*5)*.77,SPIRIT);
      }
    }
  }
  if(thrust<=.02)return;
  for(const [i,[a,b]] of engines.entries()){
    const count=low?4:8;
    for(let k=0;k<count;k++){
      const life=((now*.77+k/count+noise(i)*.47)%1),length=15+mission.lift*.078;
      const [px,py,pz]=elev(a+Math.sin(life*4.3+i)*life*6,Math.max(-2,mission.lift-17-length*life),b+Math.cos(life*3.5+i)*life*8);
      fume(effects,i*31+k,[px,py,pz],5+life*(21+mission.lift*.023),'c4c1b6',(1-life)*thrust*.54,EXHAUST);
    }
  }
  if(mission.lift<165){
    const count=low?17:36;
    for(let i=0;i<count;i++){
      const phase=(now*.27+noise(i)*.65)%1,a=i*2.399,dist=half*.6+phase*112;
      const opacity=thrust*(1-phase)*(1-smooth(mission.lift/165))*.62;
      fume(effects,i,[x+Math.sin(a)*dist,floor-1+phase*(4+noise(i+3)*8),z+Math.cos(a)*dist],
        8+phase*39,'a59c86',opacity,DUST);
    }
  }
}
function missileEffects(effects,m,low){
  if(m.age<90)return;
  fume(effects,0,[m.x,m.y,m.z],4.15,'ffc77d',.61,SPIRIT);
  const points=[[m.x,m.y,m.z],...(m.track??[])];
  for(let i=1;i<points.length;i++){
    const tail=i/Math.max(12,points.length),count=low?2:3;
    for(let p=0;p<count;p++){
      const t=p/count,position=add(points[i-1],vector(points[i-1],points[i]),t);
      position[1]+=tail*tail*2.5;
      position[0]+=Math.sin(i*1.6+t)*tail*.72;
      fume(effects,i+p,position,mix(1.9,13,tail),'d7d5c8',(1-tail)*.56,EXHAUST);
    }
  }
}
function blastEffects(effects,blast,low){
  const t=blast.age/1000,center=[blast.x,blast.y+.37,blast.z],heat=1-smooth(t/.38);
  if(heat>0)fume(effects,0,center,10+t*36,'ffe2a8',heat*.89,SPIRIT);
  fume(effects,0,center,7+t*42,'f1c895',(1-smooth(t/.75))*.80,SHOCK);
  for(let i=0;i<(low?11:28);i++){
    const a=i*2.399,speed=2+noise(i+7)*16,dy=noise(i+3),life=1-smooth(t/2.6);
    const p=add(center,[Math.sin(a)*speed*t,Math.max(-.1,dy*t*10-t*t*2),Math.cos(a)*speed*t]);
    fume(effects,i,p,.7+t*(2.7+dy*5),i%3===0?'9e9081':'77756c',life*.55,DUST);
    if(i%3===0&&t<.68)fume(effects,i,p,.8,'ffad63',(1-t/.68)*.89,SPIRIT);
  }
}
function effectsToMesh(meshes,effects,eye){
  const distance=p=>delta(p.point,eye);
  effects.sort((a,b)=>distance(b)-distance(a));
  const out=meshes.effect??=[];
  for(const {point,size,paint,alpha,kind,axis,length} of effects){
    if(delta(eye,point)>1150)continue;
    const sight=normalize(vector(point,eye));
    let right=normalize(vectorCross(axis??[0,1,0],sight));
    if(Math.hypot(...right)<.01)right=[1,0,0];
    const up=axis??vectorCross(sight,right),normal=normalize(vectorCross(right,up));
    out.push(...point,...right.map(n=>n*size),...up.map(n=>n*(length??size)),...normal,...rgb(paint),kind+alpha);
  }
}
// low draws fewer particles; short keeps everything within the 50 m radius of the light mode.
export function drawMission(meshes,mission,eye,now,low=false,groundAt,short=false){
  const effects=[];
  const lift=mission.lift??launchHeight(mission.phase,mission.elapsed),gap=Math.hypot(eye[0]-x,eye[2]-z);
  const liftDistance=Math.hypot(gap,eye[1]-floor-lift);
  if(gap<1090){
    if(liftDistance<1210){
      copyAssembly(meshes,lift);
      makeFoundation(meshes,lift,liftDistance<(low?177:325));
    }
    if(lift>.18&&gap<430)drawShaft(meshes,lift,gap<220);
    const spool=mission.phase==='evacuate'?smooth((mission.elapsed-EVACUATION_MS+3600)/3600):0;
    const thrust=mission.phase==='ascent'?1:mission.phase==='books'?0:Math.max(spool,lift===launchSite.lift?.28:0);
    if(lift>.12||spool>0){
      for(const [i,[a,b]] of engines.entries())drawEngine(meshes,effects,a,b,lift,thrust,now,liftDistance<(low?110:255),i);
      drawCannon(meshes,{...mission,lift},liftDistance<310);
      launchEffects(effects,{...mission,lift},thrust,now,low);
    }else if(mission.phase==='evacuate')launchEffects(effects,{...mission,lift},0,now,low);
  }
  const picked=new Set(mission.picked??[]);
  if(mission.phase==='books')for(const book of missionData.books)
    if(!picked.has(book.id)&&delta(eye,[book.x,book.y,book.z])<(short?52:low?58:90))drawBook(meshes,book,now);
  for(const actor of mission.enemies??[])if(Number.isFinite(actor.y)&&delta(eye,[actor.x,actor.y,actor.z])<(short?60:230))
    drawEnemy(meshes,effects,actor,now);
  for(const drop of mission.drops??[])if(delta(eye,[drop.x,drop.y,drop.z])<(short?52:120))drawAmmo(meshes,effects,drop,now,low);
  for(const bullet of mission.bullets??[])drawBullet(effects,bullet);
  for(const impact of mission.impacts??[])if(delta(eye,[impact.x,impact.y,impact.z])<160)impactEffects(effects,impact,low);
  const cars=new Map((mission.cars??[]).map(car=>[car.id,car]));
  for(const initial of missionData.cars){
    const car=cars.get(initial.id)??initial;
    if(car.id!==mission.driver&&delta(eye,[car.x,car.y,car.z])<(short?56:low?85:150)){
      const s=Math.sin(car.yaw)*1.37,c=Math.cos(car.yaw)*1.37;
      const front=groundAt?.(car.x+s,car.z-c)??car.y,rear=groundAt?.(car.x-s,car.z+c)??car.y;
      drawCar(meshes,{...car,parked:true},Math.atan2(front-rear,2.74));
      if(car.wreck){
        for(let i=0;i<5;i++){
          const t=(now*.45+i*.2)%1;
          fume(effects,i,[car.x+Math.sin(t*4+i)*t*.39,car.y+1.15+t*3.8,car.z+t*.39],
            .65+t*2.37,'5e5c57',(1-t)*.37,DUST);
        }
      }
    }
  }
  for(const m of mission.missiles??[]){
    if(delta(eye,[m.x,m.y,m.z])>1220)continue;
    drawMissile(meshes,effects,m);missileEffects(effects,m,low);
  }
  for(const blast of mission.blasts??[])if(delta(eye,[blast.x,blast.y,blast.z])<430)blastEffects(effects,blast,low);
  effectsToMesh(meshes,effects,eye);
}

let odometer={id:null,x:0,z:0,spin:0};
export function updateVehicleModel(meshes,player,pitch){
  const car=missionData.cars[player.vehicleId];
  if(odometer.id!==player.vehicleId)odometer={id:player.vehicleId,x:player.x,z:player.z,spin:0};
  const s=Math.sin(player.yaw),c=Math.cos(player.yaw);
  const forward=(player.x-odometer.x)*s-(player.z-odometer.z)*c;
  odometer.spin=(odometer.spin+forward/.335)%(Math.PI*2);
  odometer.x=player.x;odometer.z=player.z;
  drawCar(meshes,{...player,paint:car?.paint},pitch,odometer.spin);
}

// The RD II in the player's hand: a slide with three barrels side by side, a drum magazine
// for 120 rounds, a stippled grip and a gloved hand. Built in view space every frame.
// Strokes of each letter in a unit cell: center and size.
const letters={R:[[.1,.5,.2,1],[.5,.93,.6,.14],[.5,.5,.6,.14],[.85,.72,.18,.5],[.74,.2,.2,.42]],
  D:[[.1,.5,.2,1],[.5,.93,.6,.14],[.5,.07,.6,.14],[.85,.5,.18,.74]],I:[[.5,.5,.2,1],[.5,.93,.7,.14],[.5,.07,.7,.14]]};
export function drawHeldGun(meshes,eye,yaw,pitch,{kick=0,reload=0,flash=0,sway=[0,0],lowered=0,muzzleHeat=0,retract=0}={}){
  const view=meshFrame({},{x:0,y:0,z:0,yaw,pitch});
  const swing=Math.sin(reload*Math.PI),drop=lowered+swing*.11+retract*.03;
  // Close to a wall the pistol is drawn back and raised, so that it does not pass through the surface.
  const anchor=eye.map((n,i)=>n+view.right[i]*(.118+sway[0]-swing*.03)+view.up[i]*(-.118+sway[1]-drop)+
    view.forward[i]*(.36-kick*.035-retract*.17));
  const gun=meshFrame(meshes,{x:anchor[0],y:anchor[1],z:anchor[2],yaw:yaw-.045+swing*.5,
    pitch:pitch+kick*.2-swing*.55-lowered*2.2+retract*1.05});
  const {right,up,forward,back,part:m,point}=gun;
  const metal=HEAT_METAL,steel='3b4046',dark='22262a',grip='2b2a28';
  const lengthwise=[right,forward,up];
  // Slide and frame.
  m('chamfer',0,.012,.03,.071,.034,.215,steel,metal);
  m('box',0,.031,.03,.058,.004,.2,dark,metal);
  m('chamfer',0,-.014,.0,.062,.02,.15,'30353a',metal);
  for(let i=0;i<7;i++)for(const side of [-1,1])m('box',side*.0362,.012,-.052+i*.0085,.002,.026,.0035,dark,SOOT);
  m('box',0,.014,.085,.05,.012,.03,dark,SOOT);
  // Three barrels with crowned muzzles.
  for(const side of [-1,0,1]){
    m('tube',side*.0215,.012,.146,.0185,.022,.0185,'565c61',metal,lengthwise);
    m('tube',side*.0215,.012,.158,.0122,.004,.0122,'0b0c0d',SOOT,lengthwise);
    if(flash>0){
      const size=.045+.05*flash;
      m('ball',side*.0215,.012,.19+flash*.03,size,size,size*2.2,'ffd08a',IGNITION);
    }
  }
  if(flash>0)m('ball',0,.012,.24,.16*flash,.13*flash,.2*flash,'ffb060',IGNITION);
  if(muzzleHeat>0)for(const side of [-1,0,1])m('tube',side*.0215,.012,.1545,.0155,.002,.0155,'ff8a4a',IGNITION,lengthwise);
  // Sights: a notch at the rear and a lit post at the front.
  for(const side of [-1,1])m('box',side*.011,.038,-.068,.008,.01,.01,dark,SOOT);
  m('box',0,.038,.128,.005,.011,.01,dark,SOOT);
  m('box',0,.0445,.123,.0032,.0032,.001,'8dffb0',7);
  for(const side of [-1,1])m('box',side*.011,.0405,-.0735,.003,.003,.001,'ffd27a',7);
  // Trigger guard and trigger.
  m('box',0,-.05,.047,.012,.004,.058,dark,metal);
  m('box',0,-.036,.076,.012,.03,.004,dark,metal);
  m('box',0,-.036,.032,.007,.022,.005,'8d9196',metal);
  // Grip, raked back, with a drum magazine below it.
  const rake=.26,s=Math.sin(rake),c=Math.cos(rake);
  const raked=[right,up.map((n,i)=>n*c-back[i]*s),back.map((n,i)=>n*c+up[i]*s)];
  m('chamfer',0,-.073,-.047,.054,.115,.062,grip,42,raked);
  for(let i=0;i<5;i++)for(const side of [-1,1])m('box',side*.0278,-.04-i*.017,-.036-i*.0045,.002,.006,.04,'18191a',LEATHER,raked);
  m('chamfer',0,-.136,-.064,.058,.012,.07,dark,metal,raked);
  m('tube',0,-.172,-.052,.118,.05,.118,'2e3236',metal,[up,right,back.map(n=>-n)]);
  m('tube',0,-.172,-.052,.07,.054,.07,'50565b',metal,[up,right,back.map(n=>-n)]);
  for(const side of [-1,1])m('tube',side*.0262,-.172,-.052,.02,.003,.02,'c9a24a',metal,[up,right,back.map(n=>-n)]);
  // "RD II" inlaid in brass on the left of the slide.
  const text=['R','D',null,'I','I'];
  for(const [index,letter] of text.entries()){
    if(!letter)continue;
    // Seen from the left of the pistol the muzzle is on the left, so the word runs toward the rear.
    for(const [u,v,w,h] of letters[letter])
      m('box',-.0362,.004+v*.014,.062-(index*1.3+u)*.0088,.0012,h*.014,w*.0088,'d5b674',metal);
  }
  // Gloved hand and forearm.
  const glove='1d2022',sleeve='2f3a3c';
  m('chamfer',.004,-.07,-.075,.074,.1,.05,glove,LEATHER,raked);
  for(let i=0;i<3;i++)m('tube',-.012,-.052-i*.024,-.012-i*.006,.024,.07,.024,glove,LEATHER,[up,right,back.map(n=>-n)]);
  m('tube',-.03,-.012,-.03,.022,.07,.022,glove,LEATHER,lengthwise);
  m('tube',.012,-.028,.052,.02,.05,.02,glove,LEATHER,lengthwise);
  beam(meshes,point(.012,-.1,-.1),point(.07,-.22,-.36),.085,.078,sleeve,41);
  beam(meshes,point(.006,-.085,-.085),point(.02,-.115,-.14),.079,.07,glove,LEATHER);
  return {muzzle:point(0,.012,.165)};
}
