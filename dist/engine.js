import {roofFaces,chamferFaces,taperFaces,windowFaces,paneFaces} from './models.js';
import {distanceToBounds,frustumPlanes,inFrustum,glassOrder} from './mesh-batches.js';
import {SIGNAL_GREEN,SIGNAL_RED,STREET_LAMP} from './street-lights.js';
import {APPEARANCE_SCALE,eraProfiles,windowProfiles} from './facade-look.js';
import {architectureShader} from './architecture-shader.js';
import {APARTMENT_GLASS,EXHAUST,HEAT_METAL,IGNITION,LIFT_MATERIAL_OFFSET,MATERIAL_SIZE,ROOM_MATERIAL_OFFSET,SHOCK,SPIRIT,surfaceProfiles} from './architecture-materials.js';
import {AIRCRAFT,actorKinds} from './moving-models.js';
export const rad = Math.PI / 180;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export function view(eye,to) {
  const z=unit(eye.map((v,i)=>v-to[i])), x=unit(cross([0,1,0],z)), y=cross(z,x);
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
function product(a,b) {
  return new Float32Array(b.map((_,i)=>a[i%4]*b[i-i%4]+a[i%4+4]*b[i-i%4+1]+a[i%4+8]*b[i-i%4+2]+a[i%4+12]*b[i-i%4+3]));
}
function perspective(ratio) {
  const near=.12,far=1220,k=1/Math.tan(61*rad/2);
  return [k/ratio,0,0,0,0,k,0,0,0,0,(near+far)/(near-far),-1,0,0,2*near*far/(near-far),0];
}
export const cameraProjection=(eye,to,ratio)=>product(perspective(ratio),view(eye,to));
export function shadowProjection(sun,anchor,size){
  const range=146,texel=2*range/size;
  const lightView=view(sun.map((n,i)=>anchor[i]+n*410),anchor);
  lightView[12]=Math.round(lightView[12]/texel)*texel;
  lightView[13]=Math.round(lightView[13]/texel)*texel;
  return product([1/range,0,0,0,0,1/range,0,0,0,0,-2/800,0,0,0,-1,1],lightView);
}
function cube() {
  const mesh=[];
  const faces=[[[0,0,1],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],[[0,0,-1],[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],[[1,0,0],[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],[[-1,0,0],[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],[[0,1,0],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],[[0,-1,0],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]];
  for(const [n,...p] of faces) for(const i of [0,1,2,0,2,3]) mesh.push(...p[i],...n);
  return mesh;
}
function faceMesh(faces){
  const mesh=[];
  for(const vertices of faces){
    const [a,b,c]=vertices;
    const n=unit(cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])));
    for(let i=1;i<vertices.length-1;i++)for(const p of [a,vertices[i],vertices[i+1]])mesh.push(...p,...n);
  }
  return mesh;
}
function cylinder(top,segments) {
  const mesh=[];
  for(let i=0;i<segments;i++) {
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const p=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],q=[Math.cos(b)*.5,-.5,Math.sin(b)*.5];
    const r=[q[0]*top,.5,q[2]*top],s=[p[0]*top,.5,p[2]*top];
    const n=unit([Math.cos((a+b)/2),(1-top)*.5,Math.sin((a+b)/2)]);
    for(const v of [p,s,r,p,r,q]) mesh.push(...v,...n);
    for(const v of [[0,-.5,0],p,q]) mesh.push(...v,0,-1,0);
    if(top) for(const v of [[0,.5,0],r,s]) mesh.push(...v,0,1,0);
  }
  return mesh;
}
function sphere() {
  const mesh=[],p=(a,b)=>[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)];
  for(let i=0;i<8;i++) for(let j=0;j<12;j++) {
    const a=(i/8-.5)*Math.PI,b=((i+1)/8-.5)*Math.PI,c=j*Math.PI/6,d=(j+1)*Math.PI/6;
    for(const v of [p(a,c),p(b,c),p(b,d),p(a,c),p(b,d),p(a,d)]) mesh.push(...v.map(n=>n*.5),...v);
  }
  return mesh;
}
const vertex=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPosition;
layout(location=1)in vec3 aNormal;
layout(location=2)in vec3 aCenter;
layout(location=3)in vec3 aX;
layout(location=4)in vec3 aY;
layout(location=5)in vec3 aZ;
layout(location=6)in vec4 aStyle;
uniform mat4 uVP,uLightVP;
out vec3 wPos,wNormal,localPos,localNormal,extent;
out vec3 surfaceColor;
out vec4 lightPos;
flat out vec4 style;
flat out vec3 center;
void main(){
  mat3 shape=mat3(aX,aY,aZ);
  extent=vec3(length(aX),length(aY),length(aZ));
  wPos=aCenter+shape*aPosition;
  wNormal=normalize(shape*(aNormal/(extent*extent)));
  surfaceColor=vec3(0.);
  if(aStyle.a>=26.&&aStyle.a<29.){
    int corner=aPosition.x>.5?1:(aPosition.z>.5?2:0);
    float encodedNormal=aY[corner];
    vec2 normal=(vec2(mod(encodedNormal,256.),floor(encodedNormal/256.))-128.)/127.;
    wNormal=vec3(normal.x,sqrt(max(.00001,1.-dot(normal,normal))),normal.y);
    float color=aStyle[corner];
    surfaceColor=vec3(floor(color/2048.)/31.,mod(floor(color/32.),64.)/63.,mod(color,32.)/31.);
  }
  localPos=aPosition*extent; localNormal=aNormal;
  lightPos=uLightVP*vec4(wPos,1.);
  style=aStyle;center=aCenter;
  gl_Position=uVP*vec4(wPos,1.);
}`;
const noise=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
vec3 skyLight(vec3 d,vec3 sun,vec3 horizon,vec3 zenith,float night){
  float h=max(d.y,0.);
  vec3 col=mix(horizon,zenith,pow(h,.48));
  float cosSun=max(0.,dot(d,sun));
  col+=vec3(.30,.23,.14)*pow(cosSun,19.)*(1.-night);
  col+=vec3(1.,.91,.72)*smoothstep(.99974,.99991,cosSun)*(1.-night)*1.65;
  return col;
}
vec3 sky(vec3 d,vec3 sun,vec3 horizon,vec3 zenith,float night){
  float h=max(d.y,0.);
  vec3 col=skyLight(d,sun,horizon,zenith,night);
  vec2 p=d.xz/(h+.20)*3.4;
  p+=vec2(noise(p*.87),noise(p*.91+vec2(5.2,7.7)))*.53;
  float density=noise(p)*.55+noise(p*2.1)*.26+noise(p*4.4)*.13+noise(p*9.1)*.06;
  float cloud=smoothstep(.53,.73,density)*smoothstep(.018,.19,h);
  vec3 bank=mix(vec3(.72,.77,.82),vec3(.99,.98,.95),smoothstep(.53,.72,density+h*.05));
  bank+=vec3(.052,.042,.028)*pow(max(0.,dot(d,sun)),8.);
  col=mix(col,mix(bank,vec3(.17,.21,.29),night),cloud*.89);
  return col;
}
vec3 offshore(vec3 air,vec3 direction,vec3 horizon,float night,float enabled,vec2 bearing){
  float toward=enabled*smoothstep(.08,.41,dot(direction.xz,bearing));
  float below=1.-smoothstep(-.027,.001,direction.y);
  vec3 water=mix(vec3(.27,.54,.59),vec3(.074,.15,.24),night);
  return mix(air,mix(horizon,water,.78),toward*below);
}`;
const vec4Table=(name,rows)=>`const vec4 ${name}[${rows.length}]=vec4[](${rows
  .map(row=>`vec4(${row.map(value=>value.toFixed(3)).join(',')})`).join(',')});`;
const fragment=`#version 300 es
precision highp float;
in vec3 wPos,wNormal,localPos,localNormal,extent;
in vec3 surfaceColor;
in vec4 lightPos;
flat in vec4 style;
flat in vec3 center;
uniform vec3 uEye,uSun,uHorizon,uZenith;
uniform float uNight,uTime,uShadow,uHaze,uOcean,uViewRadius,uSignal,uMaterialDetail;
uniform vec2 uOceanBearing;
uniform sampler2D uDepth;
uniform highp sampler2DArray uSurfaceMaps;
out vec4 frag;
${noise}
${vec4Table('eraProfiles',eraProfiles)}
${vec4Table('windowProfiles',windowProfiles)}
${architectureShader}
float windowBorder(vec2 f,float margin,float bottom,float top,bool arch){
  float head=f.y-top;
  if(arch&&f.y>top-.13)head=max(head,
    (length(vec2((f.x-.5)/(.5-margin),(f.y-top+.13)/.13))-1.)*.13);
  return max(abs(f.x-.5)-(.5-margin),max(bottom-f.y,head));
}
float shadow(vec3 n){
  if(uShadow<.5)return 1.;
  vec3 p=lightPos.xyz/lightPos.w*.5+.5;
  if(any(lessThan(p.xy,vec2(.003)))||any(greaterThan(p.xy,vec2(.997)))||p.z>1.)return 1.;
  float sum=0.,bias=max(.00042,.0014*(1.-dot(n,uSun)));
  vec2 size=1./vec2(textureSize(uDepth,0));
  // Compare each filter tap with the receiving plane at that tap. Using the
  // center depth for all nine taps leaves bands on sloping roads and roofs.
  vec3 dx=dFdx(p),dy=dFdy(p);
  float determinant=dx.x*dy.y-dx.y*dy.x;
  vec2 gradient=abs(determinant)>1e-12?
    vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/determinant:vec2(0.);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 offset=vec2(x,y)*size*1.35;
    vec2 sampleUV=(floor((p.xy+offset)/size)+.5)*size;
    float receiver=p.z+dot(gradient,sampleUV-p.xy);
    sum+=step(receiver-bias,texture(uDepth,sampleUV).r);
  }
  float edge=min(min(p.x,1.-p.x),min(p.y,1.-p.y));
  return mix(1.,sum/9.,smoothstep(.018,.09,edge));
}
void main(){
  vec3 n=normalize(wNormal), base=style.rgb, glow=vec3(0);
  vec3 v=normalize(uEye-wPos);
  float mat=floor(style.a), gloss=.04;
  bool airborne=mat>=${LIFT_MATERIAL_OFFSET}.;
  if(airborne)mat-=${LIFT_MATERIAL_OFFSET}.;
  if((mat>=${EXHAUST}.&&mat<=${SHOCK}.)||(mat==${IGNITION}.&&fract(style.a)>.01)){
    vec2 q=localPos.xy/max(extent.xy,vec2(.001))*2.;
    float r=length(q),a=0.;
    vec3 vapor=base;
    if(mat==${IGNITION}.){
      float along=q.y*.5+.5;
      vec2 p=vec2(q.x*2.8+center.x*.13,along*7.3-uTime*7.5+center.z*.07);
      float turbulence=.61*noise(p)+.27*noise(p*2.0)+.12*noise(p*4.03);
      float width=mix(.83,.075,pow(along,.72))*(.78+.36*turbulence);
      float horizontal=abs(q.x)/width;
      float cell=.82+.18*cos((along*19.1-uTime*6.+turbulence*.8)*6.283);
      float hot=(1.-smoothstep(.28,.90,horizontal))*pow(1.-along,.78)*cell;
      a=(1.-smoothstep(.05,1.28,horizontal))*(1.-smoothstep(.52,1.,along))*(.53+.51*turbulence);
      vapor=mix(vec3(1.,.26,.074),vec3(1.,.97,.80),hot);
      vapor=mix(vapor,vec3(1.,.81,.53),a*.25);
    }else if(mat==${SHOCK}.){
      a=exp(-pow((r-.77)*11.,2.))*.64+exp(-r*r*8.)*.25;
    }else{
      vec2 p=q*3.9+center.xz*.346+vec2(uTime*.12,-uTime*.19);
      float turbulence=noise(p)*.63+noise(p*2.03)*.26+noise(p*4.07)*.11;
      a=(1.-smoothstep(.26,.97,r+(turbulence-.52)*.40))*mix(.45,1.,turbulence);
      if(mat==${SPIRIT}.)a=exp(-r*r*3.6)*(1.-smoothstep(.64,1.,r));
      vapor*=.53+.64*turbulence;
    }
    float dist=length(uEye-wPos);
    float fog=1.-exp(-dist*uHaze*.24);
    frag=vec4(mix(vapor,uHorizon,fog*.56),a*fract(style.a));
    return;
  }
  bool furnished=mat>=${ROOM_MATERIAL_OFFSET}.;
  if(furnished)mat-=${ROOM_MATERIAL_OFFSET}.;
  bool refitted=mat>=48.&&mat<=53.;
  if(mat>=26.&&mat<29.)base=surfaceColor;
  if(mat==22.||mat==${APARTMENT_GLASS}.){
    if(dot(n,v)<0.)n=-n;
    float grazing=pow(1.-clamp(dot(n,v),0.,1.),3.);
    vec3 reflection=windowEnvironment(reflect(-v,n));
    float clarity=1.-smoothstep(24.,235.,length(uEye-wPos))*.94;
    float opacity=mat==${APARTMENT_GLASS}.?.068+grazing*.52:.14+grazing*.56;
    frag=vec4(mix(base,reflection,.63+grazing*.32),opacity*clarity);
    return;
  }
  float footprint=max(length(dFdx(wPos)),length(dFdy(wPos)));
  int code=int(round(fract(style.a)*${APPEARANCE_SCALE}.))%${APPEARANCE_SCALE/4}-1;
  bool varied=code>=0&&code<${eraProfiles.length*64};
  int era=varied?code/64:3, pattern=varied?code%8:0;
  float weather=varied?float((code/8)%8)/7.:0.;
  vec4 proportions=eraProfiles[era],opening=windowProfiles[pattern];
  vec3 geometryNormal=n;
  float roughness;
  base=facadeMaterial(base,n,int(mat),era,footprint,roughness);
  if(mat==${HEAT_METAL}.)gloss=.31;
  if(mat==${IGNITION}.){
    float flare=.78+.15*sin(uTime*76.+center.x*.47+localPos.y*.81)+.08*sin(uTime*116.+localPos.y*2.7);
    glow+=base*max(.48,flare);
  }
  if(refitted&&uMaterialDetail<.5)base*=.96+noise(wPos.xz*1.25+wPos.y*.69)*.085;
  float grain=.5;
  if(footprint<.26)grain+=(noise(wPos.xz*8.+wPos.y*.91)-.5)*.65*(1.-smoothstep(.045,.26,footprint));
  if(footprint<.08)grain+=(noise(wPos.xz*27.-wPos.y*2.)-.5)*.35*(1.-smoothstep(.018,.08,footprint));
  base*=.966+grain*.065;
  if(weather>0.&&abs(localNormal.y)<.66&&mat!=10.){
    float along=abs(localNormal.z)>.5?wPos.x:wPos.z;
    vec2 wall=vec2(along,wPos.y);
    float lower=1.-smoothstep(.12,3.0,localPos.y+extent.y*.5);
    float visible=1.-smoothstep(.14,.75,footprint);
    float stain=noise(wall*vec2(.81,.23));
    float rain=smoothstep(.48,.83,noise(wall*vec2(3.6,.14)));
    base*=1.-weather*(.046+lower*.08+visible*(stain*.13+rain*(pattern<4?.16:.075)));
    if(pattern==2||pattern==5){
      float zigzag=wall.x*.43+wall.y*(pattern==2?.31:-.25)+noise(wall*vec2(1.8,.67))*.27;
      float fissure=1.-smoothstep(.007,.024+footprint*.4,abs(fract(zigzag)-.5));
      float broken=smoothstep(.55,.80,noise(wall*vec2(.28,.39)));
      base*=1.-weather*fissure*broken*.39*(1.-smoothstep(.04,.18,footprint));
    }
    if(pattern==4||pattern==7)base=mix(base,base*vec3(.84,1.03,.79),weather*lower*.62);
  }
  if(mat==1.||mat==28.)base*=.98+noise(wPos.xz*.56)*.035;
  if(mat==2.||mat==27.){base*=.955+noise(wPos.xz*.31)*.065;gloss=.075;}
  if(mat==3.){
    vec2 p=wPos.xz;
    float waves=1.-smoothstep(.30,1.9,footprint);
    float ripples=1.-smoothstep(.092,.51,footprint);
    vec2 swell=vec2(sin(dot(p,vec2(.24,.49))+uTime*.66),cos(dot(p,vec2(.51,-.14))+uTime*.72));
    vec2 wave=vec2(sin(p.x*1.6+p.y*.8+uTime*1.3),cos(p.y*1.8-p.x*.9+uTime*1.1));
    vec2 ripple=vec2(sin(p.y*3.5-uTime*1.9),cos(dot(p,vec2(4.5,3.2))+uTime*2.6));
    vec2 slope=swell*.029+wave*.048*waves+ripple*.024*ripples;
    n=normalize(vec3(slope.x,1.,slope.y));
    float f=pow(1.-max(dot(n,v),0.),3.);
    vec3 r=reflect(-v,n);
    base=mix(base,sky(r,uSun,uHorizon,uZenith,uNight),.23+f*.60);
    base*=mix(.974,.86+.24*noise(p*.21+uTime*.09),1.-smoothstep(1.,4.,footprint));
    gloss=.8;
    glow+=vec3(.27,.17,.07)*pow(max(dot(reflect(-uSun,n),v),0.),33.)*(1.-uNight);
  }
  if(mat==4.||mat==5.||mat==8.||mat==11.||mat==12.||mat==13.||mat==17.||mat==19.||mat==20.||mat==21.||refitted){
    bool curtainWall=mat==19.||mat==21., fins=mat==21., limestone=mat==20.;
    bool glass=mat==4.||curtainWall,shop=mat==11.,balcony=mat==12.,stone=mat==8.||limestone,brick=mat==13.,sand=mat==17.;
    bool front=abs(localNormal.z)>.5;
    vec2 p=vec2(front?localPos.x:localPos.z,localPos.y);
    vec2 span=vec2(front?extent.x:extent.z,extent.y);
    p+=span*.5;
    float wide=curtainWall?(fins?2.7:1.77):shop?2.13:(glass?1.59:(balcony?2.7:(stone?2.35:(sand?1.87:2.08))));
    float tall=curtainWall?4.56:limestone?4.10:shop?4.26:(balcony?3.77:(stone?3.90:3.68));
    if(varied){wide*=proportions.x*opening.x;tall*=proportions.y;}
    vec2 count=max(vec2(1),floor(span/vec2(wide,tall)));
    vec2 grid=p/max(span,vec2(.01))*count, f=fract(grid);
    float margin=curtainWall?(fins?.17:.040):shop?.08:(glass?.065:(balcony?.17:(sand?.31:.23)));
    float bottom=curtainWall?.12:shop?.06:(balcony?.18:.24);
    float top=shop?.70:(glass?.88:(balcony?.87:(sand?.71:.83)));
    if(varied){
      margin=clamp(margin+opening.y,.035,.42);
      bottom=clamp(bottom+opening.z,.05,.32);
      top=clamp(top+float(era-2)*.012,.65,.94);
    }
    vec2 cellFootprint=fwidth(grid);
    float vis=step(abs(localNormal.y),.48)*(1.-smoothstep(.44,1.12,max(cellFootprint.x,cellFootprint.y)));
    bool arch=varied&&era<2&&!glass&&!shop&&(pattern==0||pattern==2||pattern==6);
    float border=windowBorder(f,margin,bottom,top,arch);
    float casing=(1.-smoothstep(.00,.029,border))*vis;
    float pane=(1.-smoothstep(-.040,-.016,border))*vis;
    // The view vector moves the room behind the fixed opening and exposes the deep jamb at oblique angles.
    vec3 tangent=normalize(cross(vec3(0.,1.,0.),n)+vec3(.00001,0.,0.));
    float signOfFace=front?sign(localNormal.z):-sign(localNormal.x);
    vec2 parallax=clamp(vec2(dot(v,tangent)*signOfFace,v.y)/max(.26,abs(dot(v,n))),-2.,2.);
    float recess=varied?proportions.z*(curtainWall?.25:.46):curtainWall?.027:.106;
    vec2 back=f-parallax*vec2(recess,recess*.78);
    float backBorder=windowBorder(back,margin,bottom,top,arch);
    float reveal=(1.-smoothstep(-.008,.025,backBorder))*pane;
    float room=hash(floor(grid)+floor(center.xz*.19)+vec2(front?7.:19.,localNormal.z*3.));
    base*=1.-vis*(1.-smoothstep(.01,.058,f.y))*(balcony?.12:.048);
    if(brick&&uMaterialDetail<.5){
      vec2 courses=vec2(p.x/.43+.5*mod(floor(p.y/.16),2.),p.y/.16);
      vec2 gr=min(fract(courses),1.-fract(courses));
      base*=1.-vis*(1.-smoothstep(.025,.092,min(gr.x,gr.y)))*.16*(1.-smoothstep(.07,.23,footprint));
    }
    if((stone||sand)&&uMaterialDetail<.5){
      base*=.985+.026*noise(wPos.xz*.91+wPos.y*.42);
      if(!limestone){
        float course=1.-smoothstep(.010,.030,abs(fract(p.y/(stone?.54:.68))-.5));
        base*=1.-course*.055*vis;
      }
    }
    vec3 reflected=reflect(-v,geometryNormal);
    vec3 reflection=mix(uHorizon,uZenith,clamp(.19+f.y*.31+reflected.y*.83,0.,1.));
    if(glass||shop)reflection=mix(reflection,windowEnvironment(reflected),.67);
    float tint=curtainWall?.68:glass?.59:shop?.49:.36;
    vec3 interior=mix(vec3(.104,.124,.131),vec3(.38,.33,.26),room);
    float sidewall=smoothstep(.30,.43,abs(back.x-.50));
    float furnishing=(1.-smoothstep(.22,.37,back.y))*smoothstep(.10,.23,back.x)*(1.-smoothstep(.67,.86,back.x));
    interior*=1.-sidewall*.29-furnishing*.41*smoothstep(.21,.33,room);
    vec3 window=mix(mix(interior,style.rgb,.15),reflection,tint)*(.71+room*.32);
    float middle=1.-smoothstep(.010,varied&&era<3?.040:.033,abs(back.x-.50));
    float rail=1.-smoothstep(.012,.032,abs(back.y-mix(bottom,top,varied?opening.w:.50)));
    window*=1.-middle*(glass?.38:.56)-rail*(stone?.32:.13);
    float curtain=smoothstep(.56,.61,room)*smoothstep(.26,.68,abs(back.x-.5)*2.)*pane;
    window=mix(window,vec3(.60,.55,.44),curtain*.48);
    float sill=(1.-smoothstep(.016,.037,abs(f.y-bottom+.04)))*step(abs(f.x-.5),.53-margin)*vis;
    vec3 lit=vec3(.87,.58,.25)*(.48+room*.37);
    float inside=step(shop?.53:.73,room)*uNight;
    base=mix(base,base*(glass?.58:(stone?1.10:.85))+.026,casing);
    base=mix(base,base*(back.x>f.x?.40:.65),pane);
    base=mix(base,mix(window,lit,inside),reveal);
    base+=vec3(.18,.16,.12)*sill*(glass?.16:varied?.37+proportions.w:.48);
    if(fins)base+=vis*(1.-smoothstep(.045,.16,abs(f.x-.5)))*style.rgb*.24;
    if(curtainWall){
      float band=(1.-smoothstep(.08,.17,abs(f.y-.08)))*vis;
      base=mix(base,style.rgb*.52+.035,band);
    }
    if(shop){
      float fascia=smoothstep(.76,.81,f.y)*(1.-smoothstep(.93,.96,f.y))*vis;
      base=mix(base,style.rgb*.57+.07,fascia);
    }
    glow+=reveal*inside*lit*.72;
    gloss=glass?.25:shop?.18:.09;
  }
  if(mat==14.&&uMaterialDetail<.5){
    vec2 tile=vec2(localPos.x*4.+.5*floor(localPos.z*2.6),localPos.z*2.6);
    base*=.98+(sin(tile.x*6.283)*.026-(1.-smoothstep(.015,.095,fract(tile.y)))*.055)*(1.-smoothstep(.07,.24,footprint));
  }
  if(mat==15.){base*=.53+smoothstep(.18,.33,abs(fract(localPos.x*6.8)-.5))*.45;gloss=.21;}
  if(mat==16.&&uMaterialDetail<.5){
    vec2 st=wPos.xz;
    vec2 tile=fract(st*11.2+vec2(floor(st.y*11.2)*.47,0.));
    base*=.91+.14*grain-.14*(1.-smoothstep(.032,.097,min(tile.x,tile.y)))*(1.-smoothstep(.025,.11,footprint));
  }
  if(mat==18.&&uMaterialDetail<.5){
    base*=.96+noise(wPos.xz*.9+wPos.y*.18)*.065;
  }
  if(mat==23.&&uMaterialDetail<.5){
    vec2 p=wPos.xz*vec2(.89,.54)+wPos.y*.47;
    float vein=pow(.5+.5*sin(p.x*4.+p.y*2.+noise(p*1.7)*5.),11.);
    base*=.97+grain*.035-vein*.045;
    gloss=.21;
  }
  if(mat==24.&&uMaterialDetail<.5){
    float grainLine=noise(vec2(localPos.x*.4+localPos.y*.83,localPos.z*17.+localPos.x*8.));
    base*=.74+.34*grainLine;gloss=.13;
  }
  if(mat==25.&&uMaterialDetail<.5){
    float seam=1.-smoothstep(.018,.069,abs(fract(localPos.x*1.11+localPos.z*1.17)-.50));
    base*=.92+grain*.14-.26*seam;gloss=.18;
  }
  if(mat==6.||mat==47.){
    float foliage=noise(wPos.xz*.48+wPos.y*.61);
    float patches=noise(wPos.xz*.127);
    base*=.81+foliage*.25+patches*.11;glow+=base*(mat==6.?.105:.035);
  }
  if(mat==7.)glow+=base*(.49+uNight*.75);
  if(mat>=${SIGNAL_GREEN}.&&mat<=${SIGNAL_RED}.){
    float lit=1.-step(.5,abs(mat-uSignal));
    glow+=base*lit*.91;
    base*=mix(.14,.55,lit);
  }
  if(mat==${STREET_LAMP}.){
    glow+=base*smoothstep(.16,.65,uNight)*1.1;
    base*=.54;
  }
  if(mat==9.||mat==26.){base*=.96+.075*noise(wPos.xz*.23);
    float rock=smoothstep(.11,.38,1.-n.y)*smoothstep(21.,46.,wPos.y);
    base=mix(base,vec3(.42,.41,.38)*(.77+noise(wPos.xz*.56+wPos.y*.26)*.32),rock*.65);gloss=.035;}
  if(mat==10.){
    vec3 reflection=windowEnvironment(reflect(-v,n));
    base=varied&&abs(n.y)<.55?roomBehindGlass(n,v,base):mix(base,reflection,.36);
    glow+=base*mix(.10,.41,uNight);
    gloss=.27;roughness=.26;
  }
  float sh=shadow(geometryNormal);
  float diffuse=max(dot(n,uSun),0.);
  float hemisphere=.78+.22*n.y;
  vec3 ambient=mix(vec3(.44,.50,.58),vec3(.085,.145,.25),uNight)*hemisphere;
  vec3 sunlight=mix(vec3(1.04,1.00,.91),vec3(.12,.18,.32),uNight)*diffuse*mix(.16,1.,sh)*.81;
  if(furnished){
    ambient=vec3(.72,.70,.66)*(.90+.10*n.y);
    sunlight*=.17;
  }
  float specPower=mat==3.?72.:mix(96.,13.,roughness*roughness);
  float reflectivity=mat==25.?.17:mat==23.?.11:gloss;
  float spec=pow(max(dot(reflect(-uSun,n),v),0.),specPower)*reflectivity*sh;
  vec3 color=sqrt(max(base*base*(ambient+sunlight)+vec3(1.,.91,.77)*spec*.37,vec3(0.)))+glow;
  float dist=length(uEye-wPos);
  float fog=1.-exp(-dist*uHaze*(.49+dist*.0015)*mix(1.,.43,smoothstep(34.,145.,wPos.y)));
  if(mat==1.||mat==2.||mat==3.||mat==9.||(mat>=26.&&mat<29.)||mat==35.||mat==36.||mat==38.){
    float fadeStart=mat==3.? .24:.58;
    fog=max(fog,smoothstep(fadeStart,.80,length(uEye.xz-wPos.xz)/uViewRadius));
  }
  vec2 boundary=vec2(4000.,3000.)-abs(wPos.xz);
  fog=max(fog,1.-smoothstep(0.,113.,min(boundary.x,boundary.y)));
  if(mat==${AIRCRAFT.toFixed(1)})fog=min(fog,.69);
  if(airborne)fog=min(fog,.57);
  if(mat==${IGNITION}.)fog*=.45;
  vec3 direction=normalize(wPos-uEye);
  vec3 air=skyLight(direction,uSun,uHorizon,uZenith,uNight);
  if(fog>.48)air=mix(air,sky(direction,uSun,uHorizon,uZenith,uNight),smoothstep(.48,.82,fog));
  if(uOcean>0.)air=offshore(air,direction,uHorizon,uNight,uOcean,uOceanBearing);
  color=mix(color,air,fog);
  frag=vec4(color,1.);
}`;
const skyVertex=`#version 300 es
out vec2 screen;
void main(){
  screen=vec2((gl_VertexID<<1)&2,gl_VertexID&2)*2.-1.;
  gl_Position=vec4(screen,1.,1.);
}`;
const skyFragment=`#version 300 es
precision highp float;
in vec2 screen;
uniform vec3 uSun,uHorizon,uZenith,uRight,uUp,uForward;
uniform float uRatio,uNight,uOcean;
uniform vec2 uOceanBearing;
out vec4 frag;
${noise}
void main(){
  vec3 d=normalize(uForward+(uRight*screen.x*uRatio+uUp*screen.y)*.589);
  frag=vec4(offshore(sky(d,uSun,uHorizon,uZenith,uNight),d,uHorizon,uNight,uOcean,uOceanBearing),1.);
}`;
function makeProgram(gl,vs,fs,uniforms) {
  const create=(type,code)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program=gl.createProgram();
  const vert=create(gl.VERTEX_SHADER,vs),frag=create(gl.FRAGMENT_SHADER,fs);
  gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vert);gl.deleteShader(frag);
  return {program,u:Object.fromEntries(uniforms.map(n=>[n,gl.getUniformLocation(program,'u'+n)]))};
}
export function createRenderer(canvas) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true});
  if(!gl)throw Error('WebGL 2 unavailable');
  const common=['Sun','Horizon','Zenith','Night','Ocean','OceanBearing'];
  const main=makeProgram(gl,vertex,fragment,[...common,'VP','LightVP','Eye','Time','Shadow','Haze','Depth',
    'ViewRadius','Signal','SurfaceMaps','MaterialDetail']);
  const skies=makeProgram(gl,skyVertex,skyFragment,[...common,'Right','Up','Forward','Ratio']);
  const depth=makeProgram(gl,vertex,'#version 300 es\nprecision highp float;\nvoid main(){}',['VP']);
  const geometries={
    roof:faceMesh(roofFaces),chamfer:faceMesh(chamferFaces),taper:faceMesh(taperFaces),
    window:faceMesh(windowFaces),pane:faceMesh(paneFaces),tri:[0,0,0,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0],
    box:cube(),tube:cylinder(1,16),cone:cylinder(0,16),pyramid:cylinder(0,4),ball:sphere(),effect:faceMesh(paneFaces)
  };
  const geometry=Object.fromEntries(Object.entries(geometries).map(([kind,data])=>{
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    return [kind,{buffer,vertices:data.length/6}];
  }));
  const mobile=matchMedia('(pointer:coarse)').matches;
  const maxResidentBytes=(mobile?22:42)*1024*1024;
  const residents=new Map(),skyVao=gl.createVertexArray();
  const people=Object.fromEntries(actorKinds.map(kind=>{
    const buffer=gl.createBuffer();
    return [kind,{buffer,mesh:instanceMesh(kind,buffer,0,0),scratch:new Float32Array(0)}];
  }));
  const paneBuffer=gl.createBuffer(),paneMesh=instanceMesh('pane',paneBuffer,0,0);
  const surfaceTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfaceTexture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,1,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,190,128]));
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  gl.activeTexture(gl.TEXTURE0);
  let surfacesReady=false;
  let paneData=new Float32Array(0);
  let scene=[],sceneSet=new Set(),residentBytes=0,renderedFrames=0,detailRadius=227,viewRadius=435;
  let quality='auto',autoScale=1,previousWalkers;
  let lightVP=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  let shadowBuffer,shadowUnsupported=false,lightKey='',lightPlanes,shadowDirty=true,lastShadow=-Infinity;
  let clientWidth=canvas.clientWidth,clientHeight=canvas.clientHeight;
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(([entry])=>{
    clientWidth=entry.contentRect.width;
    clientHeight=entry.contentRect.height;
  }):null;
  resize?.observe(canvas);

  function instanceMesh(kind,buffer,start,count){
    const vao=gl.createVertexArray(),shape=geometry[kind];
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,shape.buffer);
    for(let i=0;i<2;i++){
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(let i=2;i<=6;i++){
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i,i===6?4:3,gl.FLOAT,false,64,start*4+(i-2)*12);
      gl.vertexAttribDivisor(i,1);
    }
    return {vao,vertices:shape.vertices,count};
  }

  function createShadowBuffer(){
    const size=2048,framebuffer=gl.createFramebuffer(),texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,size,size);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,texture,0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    if(ready)return {size,framebuffer,texture};
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    shadowUnsupported=true;
    return null;
  }

  function trimCache(){
    if(residentBytes<=maxResidentBytes&&residents.size<=72)return;
    const unused=[...residents].filter(([batch])=>!sceneSet.has(batch));
    unused.sort((a,b)=>a[1].used-b[1].used);
    for(const [batch,resident] of unused){
      for(const mesh of resident.meshes.values())gl.deleteVertexArray(mesh.vao);
      gl.deleteBuffer(resident.buffer);
      residents.delete(batch);
      residentBytes-=batch.data.byteLength;
      if(residentBytes<=maxResidentBytes&&residents.size<=72)break;
    }
  }

  function load(batches,range,radius=435){
    scene=batches;
    sceneSet=new Set(batches);
    detailRadius=range;
    viewRadius=radius;
    shadowDirty=true;
    trimCache();
  }

  function upload(batch){
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,batch.data,gl.STATIC_DRAW);
    residents.set(batch,{buffer,meshes:new Map(),used:renderedFrames});
    residentBytes+=batch.data.byteLength;
    shadowDirty=true;
  }

  function updateActors(walkers){
    if(walkers===previousWalkers)return;
    previousWalkers=walkers;
    for(const [kind,actor] of Object.entries(people)){
      const data=walkers?.[kind];
      actor.mesh.count=(data?.length??0)/16;
      if(!actor.mesh.count)continue;
      gl.bindBuffer(gl.ARRAY_BUFFER,actor.buffer);
      if(actor.scratch.length<data.length){
        actor.scratch=new Float32Array(2**Math.ceil(Math.log2(data.length)));
        gl.bufferData(gl.ARRAY_BUFFER,actor.scratch.byteLength,gl.DYNAMIC_DRAW);
      }
      actor.scratch.set(data);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,actor.scratch,0,data.length);
    }
  }

  function drawMesh(mesh){
    if(!mesh.count)return;
    gl.bindVertexArray(mesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLES,0,mesh.vertices,mesh.count);
  }

  function drawBatches(visible,planes,eye){
    const detailLimit=detailRadius*detailRadius;
    for(const batch of visible){
      const resident=residents.get(batch);
      if(!resident)continue;
      resident.used=renderedFrames;
      for(const range of batch.ranges){
        if(range.kind==='pane'||!inFrustum(range.bounds,planes))continue;
        if(range.detail&&distanceToBounds(range.bounds,eye[0],eye[2])>detailLimit)continue;
        let mesh=resident.meshes.get(range);
        if(!mesh){
          mesh=instanceMesh(range.kind,resident.buffer,range.start,range.count);
          resident.meshes.set(range,mesh);
        }
        drawMesh(mesh);
      }
    }
  }
  function drawGlass(front,planes,eye,forward){
    const sorted=glassOrder(front.filter(batch=>residents.has(batch)),planes,eye,forward,detailRadius);
    if(!sorted.length)return;
    const length=sorted.length*16;
    gl.bindBuffer(gl.ARRAY_BUFFER,paneBuffer);
    if(paneData.length<length){
      paneData=new Float32Array(2**Math.ceil(Math.log2(length)));
      gl.bufferData(gl.ARRAY_BUFFER,paneData.byteLength,gl.DYNAMIC_DRAW);
    }
    for(const [i,{data,offset}] of sorted.entries())paneData.set(data.subarray(offset,offset+16),i*16);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,paneData,0,length);
    paneMesh.count=sorted.length;
    drawMesh(paneMesh);
  }

  function render(eye,to,lighting,time,walkers,arrival,signal=SIGNAL_GREEN){
    renderedFrames++;
    const movedActors=walkers!==previousWalkers;
    updateActors(walkers);
    if(!resize){clientWidth=canvas.clientWidth;clientHeight=canvas.clientHeight;}
    const dpi=devicePixelRatio||1;
    const normalScale=Math.min(dpi,quality==='high'?1.85:mobile?1.12:1.65);
    const scale=quality==='low'?Math.min(dpi,.75):quality==='auto'?normalScale*autoScale:normalScale;
    const w=Math.max(1,Math.round(clientWidth*scale)),h=Math.max(1,Math.round(clientHeight*scale));
    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;
      canvas.height=h;
    }
    const vp=cameraProjection(eye,to,w/h),planes=frustumPlanes(vp);
    const {sun,horizon,zenith,night,haze,ocean}=lighting;
    const shadowsWanted=quality!=='low'&&eye[1]>-3&&!shadowUnsupported;
    if(shadowsWanted&&!shadowBuffer)shadowBuffer=createShadowBuffer();
    const shadows=shadowsWanted&&!!shadowBuffer;
    let movedLight=false;
    if(shadows){
      const anchor=[Math.round(eye[0]/52)*52,Math.round(eye[1]/24)*24,Math.round(eye[2]/52)*52];
      const key=sun.map(n=>Math.round(n*12)).join(',')+':'+anchor.join(',');
      if(key!==lightKey){
        lightVP=shadowProjection(sun,anchor,shadowBuffer.size);
        lightPlanes=frustumPlanes(lightVP);
        lightKey=key;
        movedLight=true;
      }
    }

    const front=[],casters=[];
    const ordered=scene.map(batch=>({batch,distance:distanceToBounds(batch.bounds,eye[0],eye[2])}));
    ordered.sort((a,b)=>a.distance-b.distance);
    for(const {batch} of ordered){
      if(inFrustum(batch.bounds,planes))front.push(batch);
      if(shadows&&inFrustum(batch.bounds,lightPlanes))casters.push(batch);
    }
    // Keep old buffers resident and upload new ones in small batches as the camera moves.
    let uploads=0,bytes=0;
    if(arrival&&front.includes(arrival)&&!residents.has(arrival)){
      upload(arrival);uploads++;bytes+=arrival.data.byteLength;
    }
    for(const batch of [...front,...casters]){
      if(residents.has(batch))continue;
      const size=batch.data.byteLength;
      if(uploads>=3||uploads&&bytes+size>900*1024)break;
      upload(batch);
      uploads++;
      bytes+=size;
    }
    trimCache();

    gl.enable(gl.DEPTH_TEST);
    if(shadows&&(movedLight||shadowDirty&&time-lastShadow>=.08||movedActors&&time-lastShadow>=.13)){
      const {framebuffer,size}=shadowBuffer;
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.viewport(0,0,size,size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(4,8);
      gl.useProgram(depth.program);
      gl.uniformMatrix4fv(depth.u.VP,false,lightVP);
      drawBatches(casters,lightPlanes,eye);
      for(const [kind,actor] of Object.entries(people))if(kind!=='effect')drawMesh(actor.mesh);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      lastShadow=time;
      shadowDirty=false;
    }
    gl.viewport(0,0,w,h);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const send=u=>{
      gl.uniform3fv(u.Sun,sun);gl.uniform3fv(u.Horizon,horizon);gl.uniform3fv(u.Zenith,zenith);
      gl.uniform1f(u.Night,night);gl.uniform1f(u.Ocean,ocean);
      gl.uniform2fv(u.OceanBearing,lighting.oceanBearing??[-1,0]);
    };
    gl.useProgram(main.program);
    send(main.u);
    gl.uniformMatrix4fv(main.u.VP,false,vp);
    gl.uniformMatrix4fv(main.u.LightVP,false,lightVP);
    gl.uniform3fv(main.u.Eye,eye);
    gl.uniform1f(main.u.Time,time);
    gl.uniform1f(main.u.Shadow,shadows?1:0);
    gl.uniform1f(main.u.Haze,haze);
    gl.uniform1f(main.u.ViewRadius,viewRadius);
    gl.uniform1f(main.u.Signal,signal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,shadowBuffer?.texture??null);
    gl.uniform1i(main.u.Depth,0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfaceTexture);
    gl.uniform1i(main.u.SurfaceMaps,1);
    gl.uniform1f(main.u.MaterialDetail,surfacesReady?(quality==='low'?1:2):0);
    gl.activeTexture(gl.TEXTURE0);
    drawBatches(front,planes,eye);
    for(const [kind,actor] of Object.entries(people))if(kind!=='effect')drawMesh(actor.mesh);

    const forward=unit(to.map((n,i)=>n-eye[i]));
    const right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(skies.program);
    send(skies.u);
    gl.uniform3fv(skies.u.Forward,forward);gl.uniform3fv(skies.u.Right,right);gl.uniform3fv(skies.u.Up,up);
    gl.uniform1f(skies.u.Ratio,w/h);
    gl.bindVertexArray(skyVao);
    gl.drawArrays(gl.TRIANGLES,0,3);

    gl.depthFunc(gl.LESS);
    gl.useProgram(main.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    drawGlass(front,planes,eye,forward);
    drawMesh(people.effect.mesh);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    return !arrival||residents.has(arrival)||!inFrustum(arrival.bounds,planes);
  }

  return {
    load,render,
    setMaterials(bytes){
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfaceTexture);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,MATERIAL_SIZE,MATERIAL_SIZE,surfaceProfiles.length,
        0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.activeTexture(gl.TEXTURE0);
      surfacesReady=true;
    },
    setQuality(value){quality=value;autoScale=1;lightKey='';shadowDirty=true;},
    setAutoScale(value){autoScale=value;},
    dispose(){
      resize?.disconnect();
      gl.deleteTexture(surfaceTexture);
    }
  };
}
export const normalize=unit;
export const vectorCross=cross;
