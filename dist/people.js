import {normalize,vectorCross} from './vector.js';

const profiles=[
  ['e0b28c','403a38','607e88','3c4755','faf0d6',1.73,.96],
  ['bd8866','302e2e','a26b52','465554','d4bea0',1.63,.89],
  ['d9ab88','695348','8a5960','41485b','e5c395',1.69,.91],
  ['a67453','292d30','ced0b8','3c5157','8c614e',1.81,1.03],
  ['c28f70','4b3530','4d6966','81765e','dfd3ba',1.76,.97],
  ['e0b795','a09a8a','8896a1','4b525b','efe6cf',1.64,.96],
  ['9d6d4e','292e2e','c29b70','6b5b4b','e3d0ab',1.78,1.02],
  ['e1ad89','684e39','b1bcba','4c6271','dcc0a4',1.70,.92],
  ['ad7754','40332d','657777','88785e','cfbd95',1.83,1.02],
  ['cf9f78','383330','a87d67','3c535b','e3d0a8',1.67,.91]
];
const cache=new WeakMap();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function prepare(path){
  if(cache.has(path))return cache.get(path);
  let length=0;
  const distances=path.map((p,i)=>{
    if(i)length+=Math.hypot(p[0]-path[i-1][0],p[2]-path[i-1][2]);
    return length;
  });
  const tangents=path.map((_,i)=>{
    const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
    const dx=b[0]-a[0],dz=b[2]-a[2],norm=Math.hypot(dx,dz)||1;
    return [dx/norm,dz/norm];
  });
  const xs=path.map(p=>p[0]),zs=path.map(p=>p[2]);
  const bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
  const track={path,distances,length,tangents,bounds};
  cache.set(path,track);
  return track;
}
export function pedestrianPose(person,seconds){
  const {path,distances,length,tangents}=prepare(person.path);
  const progress=seconds*person.speed/length+person.phase,leg=Math.floor(progress);
  const phase=(progress-leg)*Math.PI,reverse=leg%2!==0;
  const along=(.5-.5*Math.cos(phase))*length,pace=Math.sin(phase);
  const distance=reverse?length-along:along;
  let at=1;
  while(at<distances.length-1&&distances[at]<distance)at++;
  const a=path[at-1],b=path[at],t=(distance-distances[at-1])/(distances[at]-distances[at-1]||1);
  const position=a.map((n,i)=>n+(b[i]-n)*t);
  const [ax,az]=tangents[at-1],[bx,bz]=tangents[at];
  const yaw=Math.atan2(ax+(bx-ax)*t,-(az+(bz-az)*t))+Math.PI*(1-Math.tanh((reverse?-pace:pace)*8))*.5;
  return {position,yaw,pace,walked:leg*length+along};
}
const tops=['3b4a5c','8c3a3a','d8d4c8','2f3b34','6b5d4f','a7b4c2','1e2228','c49a6c','556b8a','e6e1d6','7a2f3b','4f6b5a','b5a99a','2c3e66','d9c3a0'];
const bottoms=['2b3446','1f2226','4a4f57','6e6252','33465e','c9bfae','3a2f2a','58606b','23395d','8a7d6b'];
const shoes=['1c1c1e','e8e6e1','4a3426','2d2f33','7b6b5a','b9b2a6'];
const pack=hex=>parseInt(hex,16);
function hashOf(n){
  let h=Math.imul(n+0x9e3779b9,0x85ebca6b);
  h=Math.imul(h^(h>>>13),0xc2b2ae35);
  return (h^(h>>>16))>>>0;
}
// Instance layout for the skinned renderer: position, yaw, height scale, build, walk phase,
// gait weight, stride per body height, arm pose, skin, hair, top, bottom and shoe colors, style bits.
export function humanInstance(out,{x,y,z,yaw,scale,build,phase,gait,stride,reach=0,skin,hair,top,bottom,shoe,style}){
  out.push(x,y,z,yaw,scale,build,phase,gait,stride,reach,pack(skin),pack(hair),pack(top),pack(bottom),pack(shoe),style);
}
function detailedPeople(people,seconds,eye,out){
  const humans=[];
  for(const person of people){
    const [west,north,east,south]=prepare(person.path).bounds;
    if(eye[0]<west-155||eye[0]>east+155||eye[2]<north-155||eye[2]>south+155)continue;
    const pose=pedestrianPose(person,seconds),[x,y,z]=pose.position;
    if(Math.hypot(x-eye[0],z-eye[2])>155)continue;
    const [skin,hair,shirt,pants,accent,height,build]=profiles[person.id%profiles.length];
    const h=hashOf(person.id);
    const female=h%5===1||h%5===3;
    const scale=(female?height*.955:height)/1.75;
    const stride=1.42;
    const walk=clamp(pose.pace*6,0,1);
    let style=(female?1:0)<<8;
    if(h&16)style|=1;
    if(!female&&(h>>>5)%7===0)style|=2;
    if((h>>>8)%10<3)style|=4;
    else if((h>>>8)%10<6)style|=8;
    if((h>>>12)%3===0)style|=128;
    humanInstance(humans,{x,y,z,yaw:pose.yaw,scale,build:female?build*.94:build,
      phase:pose.walked/(stride*scale)*Math.PI*2+person.id*1.7,gait:walk,stride,
      skin,hair:female&&(h>>>14)%3===0?['6b4a32','2a2420','a07850'][(h>>>16)%3]:hair,
      top:(h>>>18)%3===0?shirt:tops[(h>>>3)%tops.length],bottom:female&&(h>>>20)%2?tops[(h>>>9)%tops.length]:(h>>>21)%2?pants:bottoms[(h>>>6)%bottoms.length],
      shoe:(h>>>24)%2?shoes[(h>>>25)%shoes.length]:accent,style});
  }
  out.humans=humans;
  return out;
}
export function peopleMeshes(people,seconds,eye,groundAt,detailed=false){
  if(detailed)return detailedPeople(people,seconds,eye,{detailed:true});
  const out={box:[],chamfer:[],tube:[],ball:[]};
  for(const person of people){
    const [west,north,east,south]=prepare(person.path).bounds;
    if(eye[0]<west-155||eye[0]>east+155||eye[2]<north-155||eye[2]>south+155)continue;
    const pose=pedestrianPose(person,seconds),[x,y,z]=pose.position;
    if(Math.hypot(x-eye[0],z-eye[2])>155)continue;
    const ground=groundAt?.(x,z);
    if(groundAt&&!Number.isFinite(ground))continue;
    const [skin,hair,shirt,pants,accent,height,build]=profiles[person.id%profiles.length];
    const scale=height/1.76,c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
    const stride=1.04*scale,cycle=pose.walked/stride+person.id*.17;
    const walk=clamp(pose.pace*6,0,1);
    const bob=.008*(1-Math.cos(cycle*4*Math.PI))*walk;
    const point=(a,b,d)=>[x+(a*c-d*s)*scale,y+b*scale+bob*clamp((b-.18)/.68,0,1),z+(a*s+d*c)*scale];
    const rgb=hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    function part(kind,a,b,d,w,h,depth,tint,mat=0){
      out[kind].push(...point(a,b,d),c*w*scale,0,s*w*scale,0,h*scale,0,-s*depth*scale,0,c*depth*scale,...rgb(tint),mat);
    }
    function limb(a,b,width,tint){
      const p=point(...a),q=point(...b),delta=q.map((n,i)=>n-p[i]),up=normalize(delta);
      const across=normalize(vectorCross(up,Math.abs(up[1])>.95?[0,0,1]:[0,1,0])),back=vectorCross(across,up);
      out.tube.push(...p.map((n,i)=>(n+q[i])*.5),...across.map(n=>n*width*scale),...delta,
        ...back.map(n=>n*width*scale),...rgb(tint),0);
    }
    part('chamfer',0,1.19,0,.43*build,.53,.25,shirt);
    part('chamfer',0,.91,.005,.33*build,.17,.23,pants);
    part('box',0,1.39,-.134,.15,.12,.021,accent);
    part('tube',0,1.50,0,.112,.15,.112,skin);
    part('ball',0,1.65,-.008,.235,.285,.235,skin);
    part('ball',0,1.744,.012,.241,.12,.236,hair);
    part('box',0,1.645,-.125,.062,.071,.056,skin);
    for(const side of [-1,1]){
      const gait=cycle+(side<0?.5:0),phase=gait-Math.floor(gait),stance=.60;
      const swingTime=clamp((phase-stance)/(1-stance),0,1);
      const back=phase<=stance?phase-stance*.5:stance*(.5-swingTime*swingTime*(3-2*swingTime));
      const across=side*.105,step=back*stride/scale*walk;
      const [px,,pz]=point(across,0,step-.035),under=groundAt?.(px,pz);
      const rise=Number.isFinite(under)&&Number.isFinite(ground)?clamp((under-ground)/scale,-.23,.23):0;
      const lift=rise+Math.sin(Math.PI*swingTime)*.13*walk;
      const hip=[across,.94,0],knee=[side*.108,.51,Math.min(-.04,step*.48-.067)],ankle=[across,.086+lift,step];
      limb(hip,knee,.155*build,pants);limb(knee,ankle,.115*build,pants);
      part('chamfer',across,.052+lift,step-.035,.13,.10,.27,'343b3c');
      const swing=-back*2.6*walk;
      const shoulder=[side*.228*build,1.41,0],elbow=[side*.257*build,1.15,swing*.135],hand=[side*.24*build,.94,swing*.22];
      limb(shoulder,elbow,.115,shirt);limb(elbow,hand,.081,person.id%3===0?shirt:skin);
      part('ball',hand[0],hand[1]-.035,hand[2],.074,.105,.074,skin);
      part('box',side*.047,1.678,-.118,.023,.019,.018,'3c3b36');
    }
    if(person.id%3===1){
      part('chamfer',.255,.88,.037,.13,.25,.24,accent);
      limb([.19,1.43,.10],[.25,1.04,.04],.027,accent);
    }
  }
  return out;
}
