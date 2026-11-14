import {depthFragment,glslLighting} from './world-shader.js';
import {humanAnimation} from './human-model.js';
import {WHEEL} from './car-model.js';

// Detailed animated actors: skinned people and cars with their own meshes and shading.
// Instance layout (16 floats) is documented in people.js (humans) and moving-models.js (cars).
const instanceInputs=`
layout(location=0)in vec3 aPosition;
layout(location=1)in vec3 aNormal;
layout(location=2)in vec4 aExtra;
layout(location=3)in vec3 aCenter;
layout(location=4)in vec3 aX;
layout(location=5)in vec3 aY;
layout(location=6)in vec3 aZ;
layout(location=7)in vec4 aStyle;
uniform mat4 uVP;
uniform float uTime;
vec3 unpackColor(float f){int i=int(f+.5);return vec3(float((i>>16)&255),float((i>>8)&255),float(i&255))/255.;}
`;

const humanVertex=`#version 300 es
precision highp float;
precision highp int;
${instanceInputs}
out vec3 wPos,wNormal,vBind;
flat out vec3 vSkin,vHair,vTop,vBottom,vShoes;
flat out float vStyle,vSeed;
out vec4 vParts;
${humanAnimation}
void main(){
  float yaw=aX.x,scale=aX.y,build=aX.z;
  float seed=fract(aZ.y*.000173+aStyle.x*.000317+aStyle.y*.000071+aStyle.w*.0617+aZ.z*.000043);
  Pose P=makePose(aY.x,aY.y,aY.z,aZ.x,uTime,seed);
  mat3 RA,RB;vec3 TA,TB;
  boneTransform(int(aExtra.x+.5),P,RA,TA);
  boneTransform(int(aExtra.y+.5),P,RB,TB);
  vec3 p=mix(RA*aPosition+TA,RB*aPosition+TB,aExtra.z);
  vec3 n=mix(RA*aNormal,RB*aNormal,aExtra.z);
  p.x*=build;n.x/=build;
  vec3 forward=vec3(sin(yaw),0.,-cos(yaw)),left=-vec3(cos(yaw),0.,sin(yaw));
  mat3 orient=mat3(left,vec3(0.,1.,0.),forward);
  wPos=aCenter+orient*p*scale;
  wNormal=normalize(orient*n);
  vBind=aPosition;
  vSkin=unpackColor(aZ.y);vHair=unpackColor(aZ.z);
  vTop=unpackColor(aStyle.x);vBottom=unpackColor(aStyle.y);vShoes=unpackColor(aStyle.z);
  vStyle=aStyle.w;vSeed=seed;
  int part=int(aExtra.w+.5);
  vParts=vec4(part==1?1.:0.,part==4?1.:0.,part==2||part==3?1.:0.,part==5?1.:0.);
  gl_Position=uVP*vec4(wPos,1.);
}`;

const humanFragment=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
in vec3 wPos,wNormal,vBind;
flat in vec3 vSkin,vHair,vTop,vBottom,vShoes;
flat in float vStyle,vSeed;
in vec4 vParts;
layout(location=0)out vec4 frag;
${glslLighting}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
float spot(vec2 p,vec2 c,vec2 r){vec2 q=(p-c)/r;return 1.-smoothstep(.6,1.,dot(q,q));}
float line(float x,float w){return 1.-smoothstep(w*.5,w,abs(x));}
void main(){
  vec3 n=normalize(wNormal),v=normalize(uEye-wPos);
  if(dot(n,v)<-.2)n=-n;
  int style=int(vStyle+.5);
  int variant=(style>>8)&3;
  int part=vParts.x>.5?1:vParts.y>.5?4:vParts.z>.5?(variant==2?3:2):vParts.w>.5?5:0;
  bool longSleeve=(style&1)!=0,shorts=(style&2)!=0,jacket=(style&4)!=0,shirt=(style&8)!=0;
  bool glow=(style&16)!=0,pale=(style&32)!=0,bag=(style&128)!=0;
  vec3 b=vBind;
  float ax=abs(b.x);
  float footprint=length(fwidth(wPos));
  float fine=1.-smoothstep(.004,.02,footprint);
  int zone=0;
  // Hairlines are drawn analytically in bind space so they stay smooth across triangles.
  if(variant!=2&&b.y>(variant==1?1.4:1.52)){
    float hairline=1.632+.55*b.z;
    float cap=b.y>1.52?smoothstep(-.004,.004,b.y-hairline):0.;
    float back=variant==1?step(b.z,.01)*step(1.42,b.y)*step(ax,.115):0.;
    float sideburn=step(.07,ax)*step(b.z,.01)*step(1.6,b.y);
    float ear=variant==1?0.:step(.074,ax)*step(abs(b.y-1.641),.03)*step(abs(b.z+.006),.024);
    part=max(cap,max(back,sideburn))*(1.-ear)>.5?1:(part==1?0:part);
  }else if(part==1)part=0;
  if(part==1)zone=4;
  else if(part==5)zone=5;
  else if(part==4)zone=3;
  else if(part==2)zone=2;
  else if(part==3)zone=1;
  else{
    bool arm=ax>.192&&b.y>.66&&b.y<1.43;
    float collar=ax<.07?1.44-(shirt?.05*(1.-smoothstep(.0,.05,ax))*step(0.,b.z):.016*step(0.,b.z)):1.49;
    float neckline=mix(collar,1.49,smoothstep(.055,.085,ax));
    if(b.y>neckline&&!arm)zone=0;
    else if(arm&&b.y<.885)zone=0;
    else if(arm)zone=(b.y>1.16||longSleeve)?1:0;
    else if(b.y>1.0)zone=1;
    else if(b.y>.105)zone=(shorts&&b.y<.53)?0:2;
    else zone=3;
  }
  vec3 albedo;float rough=.85,f0=.04,sheen=0.,translucency=0.,ao=1.;vec3 emission=vec3(0.);
  if(zone==0){
    albedo=lin(vSkin);
    if(pale)albedo=mix(albedo,vec3(.32,.33,.34),.55);
    rough=.5;f0=.028;translucency=.1;
    albedo*=.94+.08*noise(b.xy*90.+vSeed*10.);
    if(b.y>1.55&&b.z>.02){
      vec2 f=vec2(ax,b.y);
      float socket=spot(f,vec2(.031,1.664),vec2(.024,.016));
      ao*=1.-.38*socket;
      float eye=spot(f,vec2(.031,1.664),vec2(.0125,.0068))*step(.066,b.z);
      float iris=spot(f,vec2(.031,1.6645),vec2(.0062,.0062))*eye;
      albedo=mix(albedo,vec3(.62,.6,.57),eye);
      albedo=mix(albedo,lin(vHair)*.35+vec3(.008,.006,.004),iris);
      rough=mix(rough,.06,eye);
      float brow=spot(f,vec2(.034,1.684),vec2(.021,.005))*step(.06,b.z)*(1.-step(.06,ax));
      albedo=mix(albedo,lin(vHair)*.6,brow*.85);
      float lips=spot(vec2(b.x,b.y),vec2(0.,1.596),vec2(.018,.0068))*step(.07,b.z);
      albedo=mix(albedo,albedo*vec3(.82,.5,.5),lips*.75);
      float cheek=spot(f,vec2(.04,1.625),vec2(.025,.02));
      albedo=mix(albedo,albedo*vec3(1.04,.92,.9),cheek*.4);
      if(glow)emission+=vec3(1.,.08,.02)*iris*60.;
    }
    if(b.y>1.55&&b.z<.02&&b.y<1.66)ao*=.9;
  }else if(zone==1){
    albedo=lin(vTop);
    rough=.82;sheen=.6;
    float weave=noise(b.xy*vec2(700.,520.)+b.z*300.)*fine;
    albedo*=.95+weave*.1;
    float folds=sin(b.y*70.+sin(b.x*30.+b.z*20.)*2.)*.5+.5;
    ao*=.9+.1*folds;
    if(jacket&&b.z>.03){
      float opening=ax-.018-(1.42-b.y)*.07;
      float inner=step(opening,0.)*step(1.0,b.y);
      albedo=mix(albedo,vec3(.78,.77,.74),inner);
      albedo*=1.-line(opening,.012)*.5;
    }
    if(shirt&&b.z>.05&&ax<.006)albedo*=1.-.35*step(.7,fract(b.y*12.5))*step(1.02,b.y);
    if(shirt&&b.y>1.41&&b.y<1.45)albedo*=.9;
    float hem=line(b.y-1.012,.018)*step(ax,.2);
    float cuff=step(.18,ax)*line(b.y-(longSleeve?.9:1.165),.016);
    albedo*=1.-.25*max(hem,cuff);
    if(bag){
      float strap=line(b.y-1.33+b.x*1.05,.022)*step(.06,abs(b.z))*step(ax,.2);
      albedo=mix(albedo,vec3(.06,.05,.045),strap);
    }
    if(part==3){
      float lapel=line(ax-.02-(1.42-b.y)*.06,.01)*step(.02,b.z)*step(.95,b.y);
      albedo*=1.-.45*lapel;
      float belt=line(b.y-1.02,.03);
      albedo*=1.-.35*belt;
      float buttons=step(b.z,1.)*(1.-smoothstep(.006,.009,length(vec2(ax-.055,fract(b.y*7.5)-.5))))*step(.05,b.z)*step(.75,b.y);
      albedo=mix(albedo,vec3(.02),buttons);
    }
  }else if(zone==2){
    albedo=lin(vBottom);
    rough=.88;sheen=.45;
    float twill=noise(vec2(b.x*420.+b.y*420.,b.z*400.))*fine;
    albedo*=.93+twill*.12;
    if(part==0){
      float legX=ax-.1;
      float seam=line(abs(legX)-.052,.004)*step(b.y,.95);
      albedo*=1.-seam*.3;
      float crease=line(legX-.0,.003)*step(.05,b.z)*step(b.y,.92);
      albedo*=1.-crease*.12;
      float belt=step(.975,b.y)*step(b.y,1.0);
      albedo=mix(albedo,vec3(.03,.025,.02),belt*.9);
      float buckle=belt*step(ax,.018)*step(.05,b.z);
      albedo=mix(albedo,vec3(.5,.47,.4),buckle);
      float knee=spot(vec2(legX,b.y),vec2(0.,.5),vec2(.06,.05));
      ao*=1.-.12*knee;
    }else{
      float pleat=sin(atan(b.x,b.z)*22.)*.5+.5;
      ao*=.88+.12*pleat;
    }
  }else if(zone==3){
    albedo=lin(vShoes);
    rough=.42;
    float sole=1.-smoothstep(.016,.022,b.y);
    albedo=mix(albedo,luminance(albedo)>.2?vec3(.05):vec3(.8,.78,.74),sole);
    rough=mix(rough,.8,sole);
    float lace=step(.05,b.z)*step(.06,b.y)*step(b.y,.1)*step(.5,fract(b.z*90.))*step(abs(ax-.105),.02);
    albedo*=1.-lace*.3;
  }else if(zone==4){
    albedo=lin(vHair);
    rough=.5;
    float strands=noise(vec2(atan(b.x,b.z)*60.,b.y*14.))*.5+noise(vec2(atan(b.x,b.z)*160.,b.y*30.))*.5;
    albedo*=.75+.5*strands;
    ao*=.75+.25*strands;
  }else{
    albedo=lin(vTop)*.45;
    rough=.92;sheen=.4;
    float band=step(1.722,b.y)*step(b.y,1.745);
    albedo=mix(albedo,vec3(.02),band);
  }
  float NoL=max(dot(n,uSun),0.);
  float shadow=sunShadow(wPos,n,NoL)*(uQuality>.5?cloudShadow(wPos,uSun):1.);
  float share;
  vec3 color=shadeSurface(albedo,n,v,rough,0.,f0,shadow,ao,translucency,sheen,share);
  if(zone==0){
    float wrap=max(saturate((dot(n,uSun)+.45)/1.45)-NoL,0.);
    color+=albedo*vec3(1.,.38,.26)*uSunColor*shadow*wrap*.3;
  }
  if(zone==4){
    vec3 t=normalize(vec3(0.,1.,0.)-n*n.y+vec3(0.,0.,1e-4));
    vec3 h=normalize(v+uSun);
    float th=dot(t,h);
    float aniso=pow(sqrt(max(1.-th*th,0.)),70.)*.18+pow(sqrt(max(1.-pow(dot(t,normalize(h+n*.1)),2.),0.)),18.)*.05*luminance(albedo)*8.;
    color+=uSunColor*shadow*aniso*NoL;
  }
  color+=emission;
  color=aerial(color,wPos,0.);
  frag=encodeOutput(color,share);
}`;

const carVertex=`#version 300 es
precision highp float;
precision highp int;
${instanceInputs}
out vec3 wPos,wNormal,vBind;
out float vGlass;
flat out vec3 vPaint;
flat out float vFlags,vPart;
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
void main(){
  vec3 p=aPosition,n=aNormal;
  float yaw=aX.x,pitch=aX.y,spin=aX.z,steer=aY.z;
  int part=int(aExtra.x+.5);
  if(part>0){
    vec3 c=vec3(sign(p.x)*${WHEEL.x.toFixed(3)},${WHEEL.y.toFixed(3)},sign(p.z)*${WHEEL.z.toFixed(3)});
    mat3 r=rotX(spin);
    if(p.z>0.)r=rotY(steer)*r;
    p=c+r*(p-c);n=r*n;
    vBind=c+rotX(spin)*(aPosition-c);
  }else vBind=aPosition;
  vec3 forward=vec3(sin(yaw),0.,-cos(yaw)),left=-vec3(cos(yaw),0.,sin(yaw));
  mat3 orient=mat3(left,vec3(0.,1.,0.),forward)*rotX(-pitch);
  wPos=aCenter+orient*p;
  wNormal=normalize(orient*n);
  vGlass=aExtra.y;
  vPaint=unpackColor(aY.x);vFlags=aY.y;vPart=float(part);
  gl_Position=uVP*vec4(wPos,1.);
}`;

const carFragment=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
in vec3 wPos,wNormal,vBind;
in float vGlass;
flat in vec3 vPaint;
flat in float vFlags,vPart;
layout(location=0)out vec4 frag;
${glslLighting}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
float box2(vec2 p,vec2 lo,vec2 hi,float soft){
  vec2 a=smoothstep(lo-soft,lo+soft,p)*(1.-smoothstep(hi-soft,hi+soft,p));return a.x*a.y;
}
vec3 streetReflection(vec3 r,float rough){
  if(uUnderground>.5)return ambientLight(r)*.8;
  vec3 sky=skyLUT(vec3(r.x,max(r.y,.015),r.z));
  float heading=atan(r.x,r.z)*7.6;
  float bh=hash(vec2(floor(heading),14.));
  float roof=mix(.02,.3,bh*bh);
  float edge=(1.-smoothstep(roof-.015,roof+.015,r.y))*smoothstep(.03,.1,min(fract(heading),1.-fract(heading)));
  vec3 facade=mix(vec3(.18,.19,.2),vec3(.4,.36,.32),hash(vec2(floor(heading),3.)))*(uAmbSun*1.4+uSunColor*max(dot(normalize(-vec3(r.x,0.,r.z)+1e-4),uSun),0.)*.6);
  vec3 c=mix(sky,facade,edge*smoothstep(-.02,0.,r.y)*(1.-rough));
  return mix(c,uGroundRad*1.1,1.-smoothstep(-.08,.0,r.y));
}
void main(){
  vec3 n=normalize(wNormal),v=normalize(uEye-wPos);
  if(dot(n,v)<-.2)n=-n;
  int part=int(vPart+.5),flags=int(vFlags+.5);
  bool wreck=(flags&1)!=0;
  vec3 b=vBind;
  float ax=abs(b.x);
  vec3 paint=lin(vPaint);
  vec3 albedo=paint;
  float rough=.38,metal=.35,coat=1.,glass=0.,ao=1.;
  vec3 emission=vec3(0.);
  if(part==1){
    albedo=vec3(.022,.022,.024);rough=.85;metal=0.;coat=0.;
    vec2 q=vec2(b.y-${WHEEL.y.toFixed(3)},b.z-sign(b.z)*${WHEEL.z.toFixed(3)});
    float r=length(q),a=atan(q.y,q.x);
    float tread=step(.33,r)*step(.5,fract(a*24.));
    albedo*=1.-.35*tread;
    float wall=smoothstep(.27,.29,r)*(1.-smoothstep(.3,.32,r));
    albedo+=vec3(.012)*wall;
  }else if(part==2){
    vec2 q=vec2(b.y-${WHEEL.y.toFixed(3)},b.z-sign(b.z)*${WHEEL.z.toFixed(3)});
    float r=length(q),a=atan(q.y,q.x);
    float spoke=1.-smoothstep(.2,.32,abs(fract(a*5./6.2831853)-.5)*2.);
    float hub=1.-smoothstep(.045,.06,r);
    float lip=smoothstep(.185,.195,r);
    float solid=max(max(spoke,hub),lip)*step(r,.212);
    albedo=mix(vec3(.04,.04,.045),vec3(.62,.63,.64),solid);
    metal=solid;rough=mix(.6,.28,solid);coat=0.;ao=mix(.35,1.,solid);
  }else{
    glass=step(.5,vGlass);
    float trim=smoothstep(.15,.45,vGlass)*(1.-smoothstep(.55,.85,vGlass));
    if(b.y<.34&&abs(b.z)<2.05){albedo=vec3(.035);rough=.6;metal=0.;coat=.2;}
    if(n.y<-.6){albedo=vec3(.03);rough=.9;metal=0.;coat=0.;ao=.5;}
    float front=step(2.02,b.z),rear=step(b.z,-2.06);
    float grille=front*box2(vec2(ax,b.y),vec2(-1.,.43),vec2(.37,.61),.006);
    if(grille>.5){
      float hex=step(.55,fract(b.x*38.+step(.5,fract(b.y*30.))*.5))*step(.4,fract(b.y*30.));
      albedo=mix(vec3(.02),vec3(.08),hex);metal=.3;rough=.45;coat=0.;ao=.6;
    }
    float valance=step(1.98,abs(b.z))*step(b.y,.4);
    albedo=mix(albedo,vec3(.03),valance);coat*=1.-valance;metal*=1.-valance;
    float head=front*box2(vec2(ax,b.y),vec2(.44,.6),vec2(.82,.73),.008);
    if(head>.5){
      float reflector=smoothstep(.025,.04,length(vec2(fract((ax-.44)/.19)-.5,(b.y-.665)/.065*.5)));
      albedo=mix(vec3(.85),vec3(.55),reflector);metal=.9;rough=.12;coat=1.;
      emission+=vec3(1.,.96,.9)*step(.62,b.y)*step(b.y,.632)*3.;
    }
    float tail=rear*box2(vec2(ax,b.y),vec2(.36,.72),vec2(.84,.86),.008);
    if(tail>.5){albedo=vec3(.32,.012,.01);metal=0.;rough=.12;coat=1.;emission+=vec3(.9,.02,.01)*.6;}
    float plate=(front+rear)*box2(vec2(ax,b.y),vec2(-1.,.46),vec2(.255,.6),.004);
    if(plate>.5){
      albedo=vec3(.82,.82,.78);metal=0.;rough=.4;coat=.5;
      float text=step(.55,noise(vec2(b.x*90.,b.y*40.)))*box2(vec2(ax,b.y),vec2(-1.,.49),vec2(.2,.57),.002);
      albedo*=1.-.8*text;
    }
    if(ax>.82&&abs(b.z)<1.95){
      float seams=line(b.z-.94,.006)+line(b.z+.14,.006)+line(b.z+1.09,.006);
      seams*=step(.34,b.y)*step(b.y,.97);
      ao*=1.-.6*min(seams,1.);
      float handle=box2(vec2(b.z,b.y),vec2(.18,.855),vec2(.34,.885),.004)+box2(vec2(b.z,b.y),vec2(-.82,.855),vec2(-.66,.885),.004);
      if(handle>.5){albedo=vec3(.7);metal=1.;rough=.2;}
    }
    albedo=mix(albedo,vec3(.025),trim);coat*=1.-trim;metal*=1.-trim;
  }
  if(wreck){
    float char=noise(b.xz*7.+b.y*3.)*.6+noise(b.xz*31.)*.4;
    albedo=mix(vec3(.05,.045,.04),albedo*.25,smoothstep(.55,.8,char));
    rough=.95;metal=0.;coat=0.;glass*=.0;
    ao*=.7;
  }
  vec3 color;
  float NoL=max(dot(n,uSun),0.);
  float shadow=sunShadow(wPos,n,NoL)*(uQuality>.5?cloudShadow(wPos,uSun):1.);
  float share;
  float NoV=max(dot(n,v),1e-3);
  if(glass>.5){
    float F=.04+.96*pow5(1.-NoV);
    vec3 r=reflect(-v,n);
    vec3 h=normalize(v+uSun);
    vec3 glint=uSunColor*D_GGX(max(dot(n,h),0.),.0009)*V_SmithGGX(NoV,NoL,.0009)*F*NoL*shadow;
    vec3 inside=vec3(.004,.0045,.005)*(uAmbUp*8.+uSunColor*.3);
    color=mix(inside,streetReflection(r,0.),F)+glint;
    share=.3;
  }else{
    color=shadeSurface(albedo,n,v,rough,metal,.04,shadow,ao,0.,0.,share);
    if(coat>0.){
      float F=.04+.96*pow5(1.-NoV);
      vec3 r=reflect(-v,n);
      vec3 h=normalize(v+uSun);
      float a=.0016;
      vec3 spec=uSunColor*D_GGX(max(dot(n,h),0.),a)*V_SmithGGX(NoV,NoL,a)*F*NoL*shadow;
      color=color*(1.-F*coat)+(streetReflection(r,0.)*F*ao+spec)*coat;
    }
  }
  color+=emission;
  color=aerial(color,wPos,0.);
  frag=encodeOutput(color,share);
}`.replace('vec3 lin(vec3 c)','float line(float x,float w){return 1.-smoothstep(w*.5,w,abs(x));}\nvec3 lin(vec3 c)');

export function createActorRenderer(gl,{compileProgram,mobile}){
  const programs={
    human:compileProgram(gl,humanVertex,humanFragment),
    humanDepth:compileProgram(gl,humanVertex,depthFragment),
    car:compileProgram(gl,carVertex,carFragment),
    carDepth:compileProgram(gl,carVertex,depthFragment)
  };
  const meshes=new Map(),buckets=new Map();
  let humans=null,cars=null,ready=false;

  function addMesh(key,{vertices,indices}){
    const buffer=gl.createBuffer(),elements=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
    const wide=indices instanceof Uint32Array;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
    meshes.set(key,{buffer,elements,count:indices.length,type:wide?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT});
  }
  function received(list){
    for(const {key,mesh} of list)if(!meshes.has(key))addMesh(key,mesh);
    ready=['human0-0','human1-0','human2-0','car-0'].every(k=>meshes.has(k));
  }
  // The meshes are built off the main thread; the detailed path switches on once the
  // low-detail bodies have arrived. A failing worker falls back to building only what is missing.
  let worker=null,disposed=false;
  async function buildLocally(){
    try{
      const {buildModels}=await import('./model-worker.js');
      for(const list of buildModels()){if(disposed)return;received(list);}
    }catch(error){console.info('Detailed actor meshes unavailable',error.message);}
  }
  try{
    worker=new Worker(new URL('./model-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(disposed)return;received(data.meshes);if(data.done){worker.terminate();worker=null;}};
    worker.onerror=worker.onmessageerror=()=>{worker?.terminate();worker=null;if(!disposed)void buildLocally();};
  }catch{void buildLocally();}

  function bucket(key,meshKey){
    let entry=buckets.get(key);
    if(entry&&entry.meshKey===meshKey)return entry;
    const mesh=meshes.get(meshKey);
    if(!mesh)return null;
    const vao=gl.createVertexArray(),buffer=entry?.buffer??gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,40,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,40,12);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,40,24);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(let i=0;i<5;i++){
      gl.enableVertexAttribArray(3+i);
      gl.vertexAttribPointer(3+i,i===4?4:3,gl.FLOAT,false,64,i*12);
      gl.vertexAttribDivisor(3+i,1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.elements);
    gl.bindVertexArray(null);
    if(entry?.vao)gl.deleteVertexArray(entry.vao);
    entry={vao,buffer,mesh,meshKey,data:entry?.data??new Float32Array(256),capacity:entry?.capacity??0,count:0};
    buckets.set(key,entry);
    return entry;
  }
  function fill(entry,source,indices){
    const length=indices.length*16;
    if(entry.data.length<length)entry.data=new Float32Array(2**Math.ceil(Math.log2(length)));
    for(const [i,index] of indices.entries())for(let k=0;k<16;k++)entry.data[i*16+k]=source[index*16+k];
    gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
    if(entry.capacity<entry.data.length){gl.bufferData(gl.ARRAY_BUFFER,entry.data.byteLength,gl.DYNAMIC_DRAW);entry.capacity=entry.data.length;}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,entry.data,0,length);
    entry.count=indices.length;
  }
  function drawBucket(entry){
    if(!entry?.count)return;
    gl.bindVertexArray(entry.vao);
    gl.drawElementsInstanced(gl.TRIANGLES,entry.mesh.count,entry.mesh.type,0,entry.count);
  }
  const variantOf=(source,i)=>(Math.round(source[i*16+15])>>8)&3;
  // Bounding sphere test against frustum planes (from frustumPlanes()).
  const visible=(planes,x,y,z,radius)=>!planes||planes.every(([a,b,c,d])=>a*x+b*y+c*z+d>=-radius*Math.hypot(a,b,c));
  // Sorts actors into variant and detail buckets, skips those outside the view and uploads them.
  function prepare(eye,shadow,planes){
    const groups=[];
    if(humans?.length){
      const lists=new Map();
      for(let i=0;i<humans.length/16;i++){
        const x=humans[i*16],y=humans[i*16+1],z=humans[i*16+2],scale=humans[i*16+4];
        if(!visible(planes,x,y+.9*scale,z,1.2*scale))continue;
        const dx=x-eye[0],dz=z-eye[2],variant=variantOf(humans,i);
        const near=!shadow&&dx*dx+dz*dz<(26*scale)**2*(mobile?.6:1);
        const key='human'+variant+'-'+(near&&meshes.has('human'+variant+'-1')?1:0);
        if(!lists.has(key))lists.set(key,[]);
        lists.get(key).push(i);
      }
      for(const [key,indices] of lists)groups.push({program:'human',key:(shadow?'s':'')+key,meshKey:key,source:humans,indices});
    }
    if(cars?.length){
      const near=[],far=[];
      for(let i=0;i<cars.length/16;i++){
        const x=cars[i*16],y=cars[i*16+1],z=cars[i*16+2];
        if(!visible(planes,x,y+.7,z,2.6))continue;
        const dx=x-eye[0],dz=z-eye[2];
        (!shadow&&dx*dx+dz*dz<55*55&&meshes.has('car-1')?near:far).push(i);
      }
      if(near.length)groups.push({program:'car',key:(shadow?'s':'')+'car-1',meshKey:'car-1',source:cars,indices:near});
      if(far.length)groups.push({program:'car',key:(shadow?'s':'')+'car-0',meshKey:'car-0',source:cars,indices:far});
    }
    for(const group of groups){
      group.entry=bucket(group.key,group.meshKey);
      if(group.entry)fill(group.entry,group.source,group.indices);
    }
    return groups;
  }
  return {
    get ready(){return ready;},
    update(walkers){humans=walkers?.humans??null;cars=walkers?.cars??null;},
    draw({vp,eye,time,send,planes}){
      if(!ready)return;
      const groups=prepare(eye,false,planes);
      for(const name of ['human','car']){
        const list=groups.filter(g=>g.program===name&&g.entry);
        if(!list.length)continue;
        const p=programs[name];
        gl.useProgram(p.program);
        send(p.u);
        gl.uniform1f(p.u.Dynamic,1);
        gl.uniformMatrix4fv(p.u.VP,false,vp);
        gl.uniform3fv(p.u.Eye,eye);
        gl.uniform1f(p.u.Time,time);
        for(const g of list)drawBucket(g.entry);
      }
      gl.bindVertexArray(null);
    },
    drawShadows(matrix,time,eye,planes){
      if(!ready)return;
      const groups=prepare(eye??[0,0,0],true,planes);
      for(const name of ['human','car']){
        const list=groups.filter(g=>g.program===name&&g.entry);
        if(!list.length)continue;
        const p=programs[name+'Depth'];
        gl.useProgram(p.program);
        gl.uniformMatrix4fv(p.u.VP,false,matrix);
        gl.uniform1f(p.u.Time,time);
        for(const g of list)drawBucket(g.entry);
      }
      gl.bindVertexArray(null);
    },
    dispose(){
      disposed=true;worker?.terminate();worker=null;
      for(const entry of buckets.values()){gl.deleteVertexArray(entry.vao);gl.deleteBuffer(entry.buffer);}
      for(const mesh of meshes.values()){gl.deleteBuffer(mesh.buffer);gl.deleteBuffer(mesh.elements);}
      for(const program of Object.values(programs))gl.deleteProgram(program.program);
      buckets.clear();meshes.clear();ready=false;
    }
  };
}
