import {mergeMeshes,polygonize,sdRoundBox,smoothstep} from './mesh-builder.js';

// A mid-size sedan, 4.6 m long, facing +Z with its wheels on the ground at y=0.
// Vertex data: position, normal, [part, glass, unused, unused]. Parts: 0 body, 1 tire, 2 rim.
export const CAR_PART={body:0,tire:1,rim:2};
export const WHEEL={x:.79,y:.335,z:1.39,radius:.335,width:.225};

const lerp=(a,b,t)=>a+(b-a)*t;
function curve(points){
  return z=>{
    if(z<=points[0][0])return points[0][1];
    for(let i=1;i<points.length;i++){
      if(z<=points[i][0]){
        const [z0,y0]=points[i-1],[z1,y1]=points[i],t=(z-z0)/(z1-z0);
        return lerp(y0,y1,t*t*(3-2*t));
      }
    }
    return points.at(-1)[1];
  };
}
const belt=curve([[-2.3,.8],[-2.24,.89],[-2,.935],[-1.6,.952],[-1.1,.945],[.95,.905],[1.6,.85],[2.05,.79],[2.24,.72],[2.3,.64]]);
const halfWidth=curve([[-2.3,.74],[-2.12,.865],[-1.7,.905],[1.6,.905],[2.08,.86],[2.3,.7]]);
const roofLine=curve([[-1.64,0],[-1.52,.12],[-1.0,.39],[-.6,.475],[-.2,.49],[.22,.47],[.55,.32],[.95,0]]);
const bottomLine=curve([[-2.3,.36],[-2.05,.25],[2.05,.25],[2.3,.34]]);
const archRadius=.395;
function bottomAt(z){
  let y=bottomLine(z);
  for(const wz of [-WHEEL.z,WHEEL.z]){
    const d=z-wz;
    if(Math.abs(d)<archRadius)y=Math.max(y,WHEEL.y+Math.sqrt(archRadius*archRadius-d*d)*.98);
  }
  return y;
}
function bezier(p0,p1,p2,p3,t){
  const u=1-t;
  return [0,1].map(i=>u*u*u*p0[i]+3*u*u*t*p1[i]+3*u*t*t*p2[i]+t*t*t*p3[i]);
}
function polyline(points,count){
  const lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const total=lengths.at(-1),out=[];
  for(let k=0;k<count;k++){
    const s=total*k/(count-1);
    let i=1;
    while(i<points.length-1&&lengths[i]<s)i++;
    const t=(s-lengths[i-1])/((lengths[i]-lengths[i-1])||1);
    out.push([lerp(points[i-1][0],points[i][0],t),lerp(points[i-1][1],points[i][1],t)]);
  }
  return out;
}
// Half of a cross-section from the bottom center to the top center, with window flags.
function section(z){
  const yb=bottomAt(z),yt=belt(z),w=halfWidth(z),g=roofLine(z);
  const lower=polyline([[0,yb],[w-.12,yb],[w-.03,yb+.05],[w,yb+.15],[w+.012,(yb+yt)*.5],[w-.004,yt-.075],[w-.035,yt-.006]],13);
  const k=smoothstep(0,.12,g),gw=.655;
  const S=[w-.035,yt-.006],T=[0,yt+g+.02+.012*(1-k)];
  const C1=[lerp(w-.08,gw+.045,k),yt+g*.9];
  const C2=[lerp(w*.5,gw-.2,k),T[1]+.004];
  const upper=[];
  for(let i=1;i<=13;i++)upper.push(bezier(S,C1,C2,T,i/13));
  const points=[...lower,...upper];
  const flags=points.map((_,i)=>{
    if(i<13||g<.08)return 0;
    const t=(i-12)/13;
    const side=t>.1&&t<.56&&z>-1.0&&z<.86&&Math.abs(z+.17)>.055;
    const shield=t>.5&&t<.95&&z>.27&&z<.9;
    const rear=t>.5&&t<.95&&z>-1.53&&z<-1.02;
    return side||shield||rear?1:0;
  });
  return {points,flags};
}

function lathe(profile,segments,center,part){
  // profile: [[radius, offset along axis]] around the X axis through center.
  const vertices=[],indices=[],stride=10;
  for(let s=0;s<=segments;s++){
    const a=s/segments*Math.PI*2,c=Math.cos(a),si=Math.sin(a);
    for(let i=0;i<profile.length;i++){
      const [r,x]=profile[i];
      const prev=profile[Math.max(0,i-1)],next=profile[Math.min(profile.length-1,i+1)];
      const dr=next[0]-prev[0],dx=next[1]-prev[1];
      let nr=dx,nx=-dr;
      const l=Math.hypot(nr,nx)||1;nr/=l;nx/=l;
      vertices.push(center[0]+x,center[1]+r*c,center[2]+r*si,nx,nr*c,nr*si,part,0,0,0);
    }
  }
  const rows=profile.length;
  for(let s=0;s<segments;s++)for(let i=0;i<rows-1;i++){
    const a=s*rows+i,b=(s+1)*rows+i;
    indices.push(a,b,b+1,a,b+1,a+1);
  }
  return {vertices:new Float32Array(vertices),indices,stride};
}

export function buildCar(detail=1){
  const stations=[];
  const ends=[-2.3,-2.29,-2.27,-2.24];
  for(const z of ends)stations.push(z);
  const count=detail>.5?42:22;
  for(let i=1;i<count;i++){
    const t=i/count;
    stations.push(-2.2+4.4*t);
  }
  for(const z of [...ends].reverse())stations.push(-z);
  const shrink=z=>{const e=Math.abs(z);return e>=2.3?.62:e>=2.29?.86:e>=2.27?.96:1;};
  const rings=stations.map(z=>{
    const {points,flags}=section(Math.max(-2.24,Math.min(2.24,z)));
    const k=shrink(z);
    const cy=points.reduce((n,p)=>n+p[1],0)/points.length;
    const half=points.map(([x,y])=>[x*k,cy+(y-cy)*k]);
    const full=[...half.map(([x,y],i)=>({x,y,f:flags[i]})),...half.slice(1,-1).reverse().map(([x,y],i,arr)=>({x:-x,y,f:flags[half.length-2-i]}))];
    return {z,full};
  });
  const perRing=rings[0].full.length;
  const positions=[];
  for(const {z,full} of rings)for(const p of full)positions.push([p.x,p.y,z,p.f]);
  const normals=positions.map(()=>[0,0,0]);
  const indices=[];
  const at=(r,i)=>r*perRing+((i%perRing)+perRing)%perRing;
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<perRing;i++){
    const a=at(r,i),b=at(r,i+1),c=at(r+1,i+1),d=at(r+1,i);
    indices.push(a,b,c,a,c,d);
  }
  // Close the nose and tail with fans around the ring centers.
  const caps=[];
  for(const [r,dir] of [[0,-1],[rings.length-1,1]]){
    const ring=rings[r].full,cx=0,cy=ring.reduce((n,p)=>n+p.y,0)/ring.length;
    const center=positions.length;
    positions.push([cx,cy,rings[r].z+dir*.004,0]);
    normals.push([0,0,0]);
    for(let i=0;i<perRing;i++){
      const a=at(r,i),b=at(r,i+1);
      if(dir>0)indices.push(center,a,b);else indices.push(center,b,a);
    }
    caps.push(center);
  }
  const vec=(a,b)=>[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=[indices[i],indices[i+1],indices[i+2]].map(j=>positions[j]);
    const u=vec(a,b),v=vec(a,c),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for(const j of [indices[i],indices[i+1],indices[i+2]])for(let k=0;k<3;k++)normals[j][k]+=n[k];
  }
  // The ring runs counterclockwise seen from the front, so these face normals point outward.
  const vertices=new Float32Array(positions.length*10);
  for(const [i,p] of positions.entries()){
    let n=normals[i];
    const l=Math.hypot(...n)||1;n=n.map(v=>v/l);
    vertices.set([p[0],p[1],p[2],...n,0,p[3],0,0],i*10);
  }
  const body={vertices,indices,stride:10};
  const parts=[body];
  const tire=[[.205,-.1],[.27,-.113],[.315,-.11],[.335,-.085],[.338,-.03],[.338,.03],[.335,.085],[.315,.11],[.27,.113],[.205,.1]];
  const segments=detail>.5?28:14;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const center=[sx*WHEEL.x,WHEEL.y,sz*WHEEL.z];
    const profile=sx>0?tire:tire.map(([r,x])=>[r,-x]).reverse();
    parts.push(lathe(profile,segments,center,1));
    const rim=[[0,.102],[.06,.1],[.15,.095],[.205,.1],[.21,.09]].map(([r,x])=>[r,x*sx]);
    parts.push(lathe(sx>0?rim.slice().reverse():rim,segments,center,2));
  }
  const mirror=polygonize(p=>Math.min(
    sdRoundBox(p,[.96,1.0,.73],[.075,.05,.1],.035),sdRoundBox(p,[-.96,1.0,.73],[.075,.05,.1],.035)),
  ()=>[0,0,0,0],[-1.08,.9,.58],[1.08,1.1,.88],detail>.5?.018:.03);
  parts.push({vertices:mirror.vertices,indices:Array.from(mirror.indices),stride:10});
  return mergeMeshes(parts.map(m=>({...m,indices:Array.from(m.indices)})));
}
