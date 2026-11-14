import {clamp,dot,length,normalize,polygonize,sdCapsule,sdEllipsoid,sdRoundCone,smin,smoothstep,sub} from './mesh-builder.js';

// A 1.75 m adult in a relaxed A pose, facing +Z with +X on the figure's left.
// Three bodies are modelled: trousers, skirt with long hair, and a long coat with a hat.
const J={
  pelvis:[0,.965,0],spine:[0,1.07,0],neck:[0,1.455,-.02],crown:[0,1.75,0],
  shoulder:[.186,1.405,-.026],elbow:[.232,1.13,-.04],wrist:[.252,.877,-.006],palm:[.258,.72,.014],
  hip:[.095,.94,0],knee:[.1,.51,.016],ankle:[.103,.092,-.022],toe:[.108,.03,.16]
};
const flip=p=>[-p[0],p[1],p[2]];
export const BONES=[
  {pivot:J.pelvis,end:J.spine,parent:-1,reach:0},
  {pivot:J.spine,end:J.neck,parent:0,reach:0},
  {pivot:J.neck,end:J.crown,parent:1,reach:0},
  {pivot:J.shoulder,end:J.elbow,parent:1,reach:.085},
  {pivot:J.elbow,end:J.wrist,parent:3,reach:.075},
  {pivot:J.wrist,end:J.palm,parent:4,reach:.07},
  {pivot:flip(J.shoulder),end:flip(J.elbow),parent:1,reach:.085},
  {pivot:flip(J.elbow),end:flip(J.wrist),parent:6,reach:.075},
  {pivot:flip(J.wrist),end:flip(J.palm),parent:7,reach:.07},
  {pivot:J.hip,end:J.knee,parent:0,reach:.14},
  {pivot:J.knee,end:J.ankle,parent:9,reach:.1},
  {pivot:J.ankle,end:J.toe,parent:10,reach:.12,axis:normalize(sub(J.ankle,J.knee))},
  {pivot:flip(J.hip),end:flip(J.knee),parent:0,reach:.14},
  {pivot:flip(J.knee),end:flip(J.ankle),parent:12,reach:.1},
  {pivot:flip(J.ankle),end:flip(J.toe),parent:13,reach:.12,axis:normalize(sub(J.ankle,J.knee))}
];
for(const bone of BONES)bone.axis??=normalize(sub(bone.end,bone.pivot));
const children=BONES.map((_,i)=>BONES.map((b,j)=>b.parent===i?j:-1).filter(j=>j>=0));
export const PART={body:0,hair:1,skirt:2,coat:3,shoe:4,hat:5};

const box=(min,max)=>({min,max});
const E=(c,r)=>({fn:p=>sdEllipsoid(p,c,r),...box([c[0]-r[0],c[1]-r[1],c[2]-r[2]],[c[0]+r[0],c[1]+r[1],c[2]+r[2]])});
const C=(a,b,r1,r2=r1)=>{
  const r=Math.max(r1,r2);
  return {fn:r1===r2?p=>sdCapsule(p,a,b,r1):p=>sdRoundCone(p,a,b,r1,r2),
    ...box([0,1,2].map(i=>Math.min(a[i],b[i])-r),[0,1,2].map(i=>Math.max(a[i],b[i])+r))};
};
const both=(A,B)=>({fn:p=>Math.min(A.fn(p),B.fn(p)),...box(A.min.map((v,i)=>Math.min(v,B.min[i])),A.max.map((v,i)=>Math.max(v,B.max[i])))});
const cut=(A,plane)=>({...A,fn:p=>Math.max(A.fn(p),plane(p))});
const mx=(p,side)=>[p[0]*side,p[1],p[2]];
function primitives(variant){
  const female=variant===1,coat=variant===2,list=[];
  const put=(bone,part,k,shape)=>list.push({bone,part,k,...shape});
  put(0,0,0,E([0,.962,-.006],female?[.168,.12,.118]:[.16,.112,.112]));
  put(1,0,.05,E([0,1.1,.002],female?[.126,.118,.097]:[.14,.12,.103]));
  put(1,0,.05,E([0,1.285,-.004],female?[.146,.148,.108]:[.166,.156,.112]));
  if(female)put(1,0,.03,both(E([.054,1.282,.058],[.06,.058,.052]),E([-.054,1.282,.058],[.06,.058,.052])));
  put(1,0,.05,C([female?.132:.148,1.398,-.03],[female?-.132:-.148,1.398,-.03],female?.05:.06));
  put(2,0,.035,C([0,1.418,-.03],[0,1.565,-.006],female?.05:.056,female?.043:.048));
  put(2,0,.03,E([0,1.664,-.008],[.077,.098,.095]));
  put(2,0,.032,E([0,1.603,.025],[female?.056:.062,.066,.066]));
  put(2,0,.012,E([0,1.634,.094],[.011,.02,.017]));
  put(2,0,.01,both(E([.077,1.64,-.006],[.011,.026,.017]),E([-.077,1.64,-.006],[.011,.026,.017])));
  for(const side of [1,-1]){
    const b=side>0?0:3,m=p=>mx(p,side);
    put(3+b,0,.035,E(m([.176,1.378,-.022]),female?[.05,.068,.056]:[.058,.075,.064]));
    put(3+b,0,.02,C(m([.186,1.395,-.026]),m([.232,1.13,-.04]),female?.044:.05,female?.034:.039));
    put(4+b,0,.02,C(m([.232,1.13,-.04]),m([.252,.879,-.006]),female?.034:.038,.026));
    put(5+b,0,.016,E(m([.258,.802,.008]),[.022,.07,.043]));
    put(5+b,0,.01,C(m([.252,.853,.03]),m([.247,.802,.05]),.011));
    put(9+b,0,.03,C(m([.095,.945,0]),m([.1,.51,.016]),female?.09:.086,.054));
    put(10+b,0,.02,C(m([.1,.51,.016]),m([.103,.1,-.02]),.052,.034));
    put(10+b,0,.025,E(m([.104,.36,-.028]),[.048,.098,.049]));
    put(11+b,PART.shoe,.012,cut(C(m([.103,.062,-.048]),m([.108,.042,.145]),.05,.037),p=>-p[1]));
  }
  if(female)put(0,PART.skirt,0,cut(C([0,1.03,-.006],[0,.6,-.01],.15,.235),p=>.585-p[1]));
  if(coat){
    put(1,PART.coat,0,cut(C([0,1.3,-.012],[0,.5,-.016],.188,.24),p=>.47-p[1]));
    put(2,PART.hat,.01,both(C([0,1.712,-.01],[0,1.8,-.012],.089,.08),E([0,1.718,-.01],[.165,.011,.172])));
  }else{
    put(2,PART.hair,.008,cut(E([0,1.672,-.012],[.084,.104,.103]),p=>(1.632+.55*p[2]-p[1])/1.14));
  }
  if(female){
    put(2,PART.hair,.03,cut(C([0,1.64,-.05],[0,1.43,-.064],.088,.07),p=>p[2]+.005));
    put(2,PART.hair,.02,cut(E([0,1.62,-.02],[.093,.08,.09]),p=>1.58+.9*p[2]-p[1]));
  }
  return list;
}
function lowerBound(item,p){
  const dx=Math.max(item.min[0]-p[0],0,p[0]-item.max[0]);
  const dy=Math.max(item.min[1]-p[1],0,p[1]-item.max[1]);
  const dz=Math.max(item.min[2]-p[2],0,p[2]-item.max[2]);
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

function weightsFor(p,bone){
  const blend=(target,signed,reach)=>{
    const r=target.reach||.06;
    const radial=length(sub(sub(p,target.pivot),target.axis.map(v=>v*signed)));
    const limit=1-smoothstep(target.reach?target.reach:.5,(target.reach?target.reach:.5)+.08,radial);
    return smoothstep(-r*.6,r*.6,signed)*limit;
  };
  const self=BONES[bone];
  let other=bone,w=0;
  if(self.parent>=0){
    const s=dot(sub(p,self.pivot),self.axis);
    const toward=1-blend(self,s);
    if(toward>w){w=toward;other=self.parent;}
  }
  for(const child of children[bone]){
    const c=BONES[child],s=dot(sub(p,c.pivot),c.axis);
    const toward=blend(c,s);
    if(toward>w){w=toward;other=child;}
  }
  return [bone,other,Math.min(w,1)];
}

export function buildHuman(variant,detail=1){
  const list=primitives(variant);
  const bounds=new Float64Array(list.length);
  const field=p=>{
    let nearest=1e9;
    for(let i=0;i<list.length;i++){const b=lowerBound(list[i],p);bounds[i]=b;if(b<nearest)nearest=b;}
    if(nearest>.06)return nearest;
    let d=1e9;
    for(let i=0;i<list.length;i++){
      const item=list[i];
      if(bounds[i]>d+item.k)continue;
      d=smin(d,item.fn(p),item.k);
    }
    return d;
  };
  const label=p=>{
    let best=1e9,primitive=list[0];
    for(const item of list){
      let d=item.fn(p);
      if(item.part===PART.hair||item.part===PART.hat)d-=.004;
      if(item.part===PART.skirt||item.part===PART.coat)d-=.002;
      if(d<best){best=d;primitive=item;}
    }
    let bone=primitive.bone;
    if(primitive.part===PART.skirt||primitive.part===PART.coat){
      const side=p[0]>0?9:12,low=smoothstep(.95,.6,p[1])*clamp(Math.abs(p[0])/.08,0,1);
      return [0,side,low*.55,primitive.part];
    }
    const [a,b,w]=weightsFor(p,bone);
    return [a,b,w,primitive.part];
  };
  const step=detail>.5?.025:.048;
  return polygonize(field,label,[-.33,-.02,-.2],[.33,1.84,.24],step);
}

const glslConst=v=>`vec3(${v.map(n=>n.toFixed(4)).join(',')})`;
// Procedural gait: the pose is evaluated per vertex from the walk phase, gait weight and stride.
export const humanAnimation=`
const vec3 BONE_PIVOT[15]=vec3[](${BONES.map(b=>glslConst(b.pivot)).join(',')});
const int BONE_PARENT[15]=int[](${BONES.map(b=>b.parent).join(',')});
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
float wrapAngle(float a){return mod(a+3.14159265,6.2831853)-3.14159265;}
struct Pose{float hip[2];float knee[2];float ankle[2];float arm[2];float elbow[2];float twist,lean,bob,sway,breath,reach,headTurn;};
Pose makePose(float phase,float gait,float stride,float pose,float time,float seed){
  Pose P;
  float run=smoothstep(1.7,2.5,stride)*gait;
  float amp=asin(clamp(stride/(4.*.845),0.,.82))*gait;
  for(int side=0;side<2;side++){
    float ph=phase+float(side)*3.14159265;
    float w=wrapAngle(ph);
    P.hip[side]=amp*sin(ph)+run*.22;
    float swing=pow(max(0.,sin(ph+.75)),1.5);
    P.knee[side]=gait*(mix(1.0,1.95,run)*swing+.22*pow(max(0.,cos(ph-3.45)),8.))+.04+run*.25;
    P.ankle[side]=gait*(.16*swing-.32*exp(-pow((w+.25)*1.7,2.))+.12*run);
    P.arm[side]=-amp*mix(.9,1.25,run)*sin(ph)+run*.15;
    P.elbow[side]=mix(.18,1.45,run)+gait*(.28-run*.2)*max(0.,-sin(ph));
  }
  P.twist=-.11*amp*sin(phase);
  P.lean=mix(.02,.2,run)*gait+pose*.1;
  P.bob=-gait*mix(.022,.05,run)*(.5-.5*cos(2.*phase))+run*.02;
  P.sway=-.018*gait*cos(phase)*(1.-run*.6)+(1.-gait)*.01*sin(time*.45+seed*6.);
  P.breath=sin(time*1.7+seed*9.)*(1.-gait*.6);
  P.reach=pose;
  P.headTurn=(1.-gait)*.35*sin(time*.23+seed*17.)*smoothstep(.2,.9,sin(time*.11+seed*5.));
  return P;
}
void rotateAbout(inout mat3 R,inout vec3 T,vec3 pivot,mat3 local){
  T=R*(pivot-local*pivot)+T;
  R=R*local;
}
void boneTransform(int bone,Pose P,out mat3 R,out vec3 T){
  R=rotY(P.twist);
  T=vec3(P.sway,P.bob,0.);
  T+=BONE_PIVOT[0]-R*BONE_PIVOT[0];
  if(bone==0)return;
  if(bone>=9){
    int side=bone>=12?1:0,local=bone-9-side*3;
    rotateAbout(R,T,BONE_PIVOT[9+side*3],rotX(-P.hip[side])*rotZ((side==0?1.:-1.)*.025));
    if(local>=1)rotateAbout(R,T,BONE_PIVOT[10+side*3],rotX(P.knee[side]));
    if(local>=2)rotateAbout(R,T,BONE_PIVOT[11+side*3],rotX(-P.ankle[side]+P.hip[side]-P.knee[side]*.0));
    return;
  }
  rotateAbout(R,T,BONE_PIVOT[1],rotY(-P.twist*2.2)*rotX(P.lean+.012*P.breath));
  if(bone==1)return;
  if(bone==2){
    rotateAbout(R,T,BONE_PIVOT[2],rotY(P.twist*1.1+P.headTurn)*rotX(-P.lean*.6));
    return;
  }
  int side=bone>=6?1:0,local=bone-3-side*3;
  float sign=side==0?1.:-1.;
  float reach=P.reach;
  mat3 shoulder=rotX(-mix(P.arm[side],1.25,reach))*rotZ(sign*(.06+.05*reach));
  rotateAbout(R,T,BONE_PIVOT[3+side*3],shoulder);
  if(local>=1)rotateAbout(R,T,BONE_PIVOT[4+side*3],rotX(-mix(P.elbow[side],.25,reach)));
  if(local>=2)rotateAbout(R,T,BONE_PIVOT[5+side*3],rotX(-.1-.15*reach));
}
`;
