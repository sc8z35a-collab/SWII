import {APPEARANCE_SCALE,eraProfiles,windowProfiles} from './facade-look.js';
import {architectureShader} from './architecture-shader.js';
import {APARTMENT_GLASS,EXHAUST,HEAT_METAL,IGNITION,LIFT_MATERIAL_OFFSET,ROOM_MATERIAL_OFFSET,SHOCK,SPIRIT,DUST,LEATHER,PAPER,SOOT,SHIELD_TILE,CERAMIC_SHELL} from './architecture-materials.js';
import {SIGNAL_GREEN,SIGNAL_RED,STREET_LAMP} from './street-lights.js';
import {AIRCRAFT} from './moving-models.js';
import {glslBRDF,glslClouds,glslCommon,glslSkyLookup} from './gfx-common.js';

export const KIND_IDS={box:0,chamfer:1,taper:2,roof:3,window:4,tube:5,cone:6,pyramid:7,ball:8,tri:9,pane:10,effect:11};

// Lighting shared by every lit surface: sun with soft cascaded shadows and cloud shadows,
// sky and bounce ambience, specular environment, aerial perspective and the output encoding.
export const glslLighting=`
uniform vec3 uEye,uSun,uSunColor,uAmbUp,uAmbDown,uAmbSun,uAmbAnti,uBounce,uGroundRad;
uniform float uNight,uTime,uHaze,uFrame,uShadow,uDynamic,uEncode,uExposure,uViewRadius,uOcean,uUnderground,uQuality;
uniform vec2 uOceanBearing;
uniform vec4 uFlash;
uniform vec3 uFlashColor;
uniform mat4 uShadowVP0,uShadowVP1;
uniform vec4 uShadowRange;
uniform highp sampler2DShadow uShadowMap;
uniform highp sampler2D uShadowDepth;
${glslCommon}
${glslBRDF}
${glslSkyLookup}
${glslClouds}
// Set at the top of each main (in uniform control flow) by beginShading.
float specularVariance=0.;
vec3 shadePosition=vec3(0.);
// Geometric specular antialiasing (Tokuyoshi and Kaplanyan): where the normal turns quickly across a
// pixel, the highlight is widened instead of sparkling on rounded edges, spheres and car bodies.
void beginShading(vec3 position,vec3 geometricNormal){
  vec3 dx=dFdx(geometricNormal),dy=dFdy(geometricNormal);
  specularVariance=min(.5*(dot(dx,dx)+dot(dy,dy)),.18);
  shadePosition=position;
}
// One dynamic point light: an explosion or the launch engines. uFlash.w is the intensity at 1 m.
vec3 flashIrradiance(vec3 n){
  if(uFlash.w<=0.)return vec3(0.);
  vec3 d=uFlash.xyz-shadePosition;
  float r2=dot(d,d);
  return uFlashColor*uFlash.w*max(dot(n,d)*inversesqrt(r2+1e-4),0.)/(r2+6.);
}
vec3 ambientLight(vec3 n){
  vec3 toward=normalize(vec3(uSun.x,0.,uSun.z)+vec3(1e-4,0.,0.));
  float side=dot(n,toward);
  vec3 horizontal=mix(uAmbAnti,uAmbSun,side*.5+.5);
  vec3 a=n.y>0.?mix(horizontal,uAmbUp,n.y):mix(horizontal,uAmbDown,-n.y);
  return a+uBounce*(mix(1.,.35,side*.5+.5)*(1.-abs(n.y))+.3*max(n.y,0.));
}
vec3 environment(vec3 r,float roughness){
  if(uUnderground>.5)return ambientLight(r)*.9;
  vec3 sky=skyLUT(vec3(r.x,max(r.y,.012),r.z));
  vec3 blurred=ambientLight(r)*.78;
  vec3 above=mix(sky,blurred,smoothstep(.2,.85,roughness));
  return mix(uGroundRad*1.15,above,smoothstep(-.14,.05,r.y+roughness*.12));
}
vec2 vogel(int i,int count,float phi){
  float r=sqrt((float(i)+.5)/float(count)),a=float(i)*2.3999632+phi;
  return vec2(cos(a),sin(a))*r;
}
float shadowLookup(vec3 coord,int cascade,float rotation,float range,float texel){
  vec2 lo=vec2(float(cascade)*.5+.0005,.001),hi=vec2(float(cascade)*.5+.4995,.999);
  float receiver=coord.z;
  float search=.55/(2.*range);
  float blockers=0.,found=0.;
  for(int i=0;i<5;i++){
    vec2 o=vogel(i,5,rotation)*search;
    vec2 t=clamp(vec2((coord.x+o.x)*.5+float(cascade)*.5,coord.y+o.y),lo,hi);
    float d=texture(uShadowDepth,t).r;
    if(d<receiver){blockers+=d;found+=1.;}
  }
  if(found<.5)return 1.;
  float penumbra=(receiver-blockers/found)*800.*.0135;
  float radius=clamp(penumbra,texel*1.4,.42)/(2.*range);
  float lit=0.;
  for(int i=0;i<8;i++){
    vec2 o=vogel(i,8,rotation+1.7)*radius;
    vec2 t=clamp(vec2((coord.x+o.x)*.5+float(cascade)*.5,coord.y+o.y),lo,hi);
    lit+=texture(uShadowMap,vec3(t,receiver));
  }
  return lit*.125;
}
float sunShadow(vec3 p,vec3 n,float NoL){
  if(uShadow<.5)return 1.;
  float rotation=(ign(gl_FragCoord.xy)+fract(uFrame*.618034))*6.2831853;
  float slope=sqrt(max(1.-NoL*NoL,0.))/max(NoL,.15);
  vec4 c0=uShadowVP0*vec4(p+n*(.025+.03*slope),1.);
  vec3 a=c0.xyz/c0.w*.5+.5;
  float edge=min(min(a.x,1.-a.x),min(a.y,1.-a.y));
  if(edge>.03+.05*ign(gl_FragCoord.yx+uFrame)&&a.z<1.){
    a.z-=(.015+.02*slope)/800.;
    return shadowLookup(a,0,rotation,uShadowRange.x,uShadowRange.z);
  }
  vec4 c1=uShadowVP1*vec4(p+n*(.08+.1*slope),1.);
  vec3 b=c1.xyz/c1.w*.5+.5;
  if(any(lessThan(b.xy,vec2(.002)))||any(greaterThan(b.xy,vec2(.998)))||b.z>1.)return 1.;
  b.z-=(.05+.08*slope)/800.;
  float s=shadowLookup(b,1,rotation,uShadowRange.y,uShadowRange.w);
  float fade=min(min(b.x,1.-b.x),min(b.y,1.-b.y));
  return mix(1.,s,smoothstep(.0,.06,fade));
}
vec3 oceanHorizon(vec3 color,vec3 d){
  if(uOcean<=0.||d.y>.002)return color;
  float toward=uOcean*smoothstep(.08,.41,dot(normalize(d.xz+1e-5),uOceanBearing));
  if(toward<=0.)return color;
  float far=min((max(uEye.y,0.)+4.)/max(-d.y,.0015),20000.);
  vec2 p=uEye.xz+d.xz*far;
  // Wave detail fades with the pixel footprint so the pattern never aliases toward the horizon.
  float footprint=length(fwidth(p));
  float detail=1.-smoothstep(3.,12.,footprint);
  vec2 g=(vec2(noise(p*.045+uTime*vec2(.08,.05)),noise(p*.045+vec2(7.1,3.3)-uTime*vec2(.05,.07)))-.5)*detail;
  g+=(vec2(noise(p*.21+uTime*.3),noise(p*.21+vec2(2.,9.)-uTime*.25))-.5)*.5*(1.-smoothstep(.6,2.5,footprint));
  vec3 wn=normalize(vec3(g.x*.16,1.,g.y*.16));
  float NoV=max(dot(wn,-d),0.);
  float F=.02+.98*pow5(1.-NoV);
  vec3 r=reflect(d,wn);
  vec3 sea=vec3(.006,.026,.035)*(uAmbUp*6.+uSunColor*.55);
  vec3 h=normalize(-d+uSun);
  float glitter=D_GGX(max(dot(wn,h),0.),.012)*F*.25;
  vec3 water=mix(sea,skyLUT(vec3(r.x,max(r.y,.01),r.z)),F)+uSunColor*glitter;
  float haze=1.-smoothstep(-.035,-.0015,d.y);
  return mix(color,mix(skyLUT(vec3(d.x,.012,d.z)),water,haze),toward);
}
vec3 aerial(vec3 color,vec3 p,float edge){
  vec3 d=p-uEye;
  float dist=length(d);
  vec3 dir=d/max(dist,1e-3);
  if(uUnderground>.5){
    float f=1.-exp(-dist*uHaze*.55);
    return mix(color,uAmbUp*1.1,f);
  }
  float falloff=1./240.;
  float dy=dir.y*falloff*dist;
  float amount=uHaze*.58*dist*exp(-max(uEye.y,-30.)*falloff)*(abs(dy)>1e-4?(1.-exp(-dy))/dy:1.);
  amount+=pow(dist/max(uViewRadius*1.6,1.),3.)*.35;
  float f=1.-exp(-amount);
  vec3 haze=skyLUT(vec3(dir.x,max(dir.y,0.)*.45+.035,dir.z))*1.05+uSunColor*phaseHG(dot(dir,uSun),.75)*.022;
  color=mix(color,haze,f);
  if(edge>0.){
    vec3 behind=dir.y<0.?distantBackdrop(dir):skyLUT(dir);
    color=mix(color,oceanHorizon(behind,dir),edge);
  }
  return color;
}
vec4 encodeOutput(vec3 color,float share){
  color=min(color*uExposure,vec3(60000.));
  if(uEncode>.5)color=sqrt(color/(1.+color));
  return vec4(color,uDynamic>.5?-max(share,.003):share);
}
// Physically based shading. Returns radiance and the ambient share used by ambient occlusion.
vec3 shadeSurface(vec3 albedo,vec3 n,vec3 v,float roughness,float metal,float f0,float shadow,float occlusion,
  float translucency,float sheen,out float share){
  vec3 l=uSun,h=normalize(v+l);
  float NoL=max(dot(n,l),0.),NoV=max(dot(n,v),1e-4),NoH=max(dot(n,h),0.),VoH=max(dot(v,h),0.);
  float a=max(roughness*roughness,.0025);
  a=sqrt(min(a*a+specularVariance,1.));
  vec3 specColor=mix(vec3(f0),albedo,metal),diffColor=albedo*(1.-metal);
  vec3 F=F_Schlick(specColor,VoH);
  vec3 sun=uSunColor*shadow;
  vec3 direct=(diffColor/PI*(1.-F)+D_GGX(NoH,a)*V_SmithGGX(NoV,NoL,a)*F)*sun*NoL;
  if(translucency>0.){
    float back=pow(saturate(dot(-v,l)),3.)*.75+.25*saturate(-dot(n,l)*.5+.5);
    direct+=diffColor*sun*translucency*back*.55;
  }
  vec3 ambientDiffuse=diffColor*ambientLight(n)*occlusion;
  if(sheen>0.)ambientDiffuse+=diffColor*ambientLight(v)*sheen*pow(1.-NoV,3.)*.8;
  float specOcclusion=saturate(pow(NoV+occlusion,exp2(-16.*a-1.))-1.+occlusion);
  vec3 ambientSpec=environment(reflect(-v,n),roughness)*envBRDF(specColor,roughness,NoV)*specOcclusion;
  vec3 ambient=ambientDiffuse+ambientSpec;
  direct+=diffColor/PI*flashIrradiance(n);
  share=luminance(ambient)/max(luminance(ambient+direct),1e-5);
  return direct+ambient;
}
`;

export const worldVertex=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPosition;
layout(location=1)in vec3 aNormal;
layout(location=2)in vec3 aCenter;
layout(location=3)in vec3 aX;
layout(location=4)in vec3 aY;
layout(location=5)in vec3 aZ;
layout(location=6)in vec4 aStyle;
uniform mat4 uVP;
uniform float uTime;
uniform int uKind;
out vec3 wPos,wNormal,localPos,localNormal,extent;
out vec3 surfaceColor;
flat out vec4 style;
flat out vec3 center;
flat out mat3 basis;
${glslCommon}
void main(){
  mat3 shape=mat3(aX,aY,aZ);
  extent=vec3(length(aX),length(aY),length(aZ));
  vec3 position=aPosition;
  float mat=floor(aStyle.a);
  if(mat>=${LIFT_MATERIAL_OFFSET}.)mat-=${LIFT_MATERIAL_OFFSET}.;
  if(mat>=${ROOM_MATERIAL_OFFSET}.)mat-=${ROOM_MATERIAL_OFFSET}.;
  bool canopy=uKind==${KIND_IDS.ball}&&(mat==6.||mat==45.);
  if(canopy){
    vec3 q=normalize(aPosition+vec3(1e-5));
    float lump=noise3(q*2.7+aCenter*.31)*.62+noise3(q*5.9+aCenter.zxy*.17)*.38;
    position=aPosition*(.80+.40*lump);
  }
  wPos=aCenter+shape*position;
  if(canopy||(uKind==${KIND_IDS.tube}&&mat==6.)){
    float height=max(position.y+.5,0.);
    float sway=sin(uTime*1.25+dot(aCenter.xz,vec2(.13,.17)))*.6+sin(uTime*2.9+aCenter.x*.7)*.25;
    wPos.xz+=vec2(.8,.5)*sway*.035*height*min(extent.y,4.);
  }
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
  localPos=position*extent;localNormal=aNormal;
  style=aStyle;center=aCenter;
  basis=mat3(aX/max(extent.x,1e-6),aY/max(extent.y,1e-6),aZ/max(extent.z,1e-6));
  gl_Position=uVP*vec4(wPos,1.);
}`;

export const depthFragment=`#version 300 es
precision highp float;
precision highp int;
void main(){}`;

const vec4Table=(name,rows)=>`const vec4 ${name}[${rows.length}]=vec4[](${rows
  .map(row=>`vec4(${row.map(value=>value.toFixed(3)).join(',')})`).join(',')});`;

export const worldFragment=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
in vec3 wPos,wNormal,localPos,localNormal,extent;
in vec3 surfaceColor;
flat in vec4 style;
flat in vec3 center;
flat in mat3 basis;
uniform float uSignal,uMaterialDetail;
uniform int uKind;
uniform highp sampler2DArray uSurfaceMaps;
layout(location=0)out vec4 frag;
${glslLighting}
${vec4Table('eraProfiles',eraProfiles)}
${vec4Table('windowProfiles',windowProfiles)}
${architectureShader}
float windowBorder(vec2 f,float margin,float bottom,float top,bool arch){
  float head=f.y-top;
  if(arch&&f.y>top-.13)head=max(head,(length(vec2((f.x-.5)/(.5-margin),(f.y-top+.13)/.13))-1.)*.13);
  return max(abs(f.x-.5)-(.5-margin),max(bottom-f.y,head));
}
vec3 toLinear(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
vec4 effectColor(float mat){
  vec2 q=localPos.xy/max(extent.xy,vec2(.001))*2.;
  float r=length(q),a=0.;
  vec3 tint=toLinear(style.rgb),color;
  if(mat==${IGNITION}.){
    float along=saturate(q.y*.5+.5);
    vec2 p=vec2(q.x*2.8+center.x*.13,along*7.3-uTime*7.5+center.z*.07);
    float turbulence=.61*noise(p)+.27*noise(p*2.)+.12*noise(p*4.03);
    float width=mix(.83,.075,pow(along,.72))*(.78+.36*turbulence);
    float horizontal=abs(q.x)/width;
    float cell=.82+.18*cos((along*19.1-uTime*6.+turbulence*.8)*6.283);
    float hot=(1.-smoothstep(.28,.90,horizontal))*pow(1.-along,.78)*cell;
    a=(1.-smoothstep(.05,1.28,horizontal))*(1.-smoothstep(.52,1.,along))*(.53+.51*turbulence);
    color=mix(vec3(1.,.22,.04),vec3(1.,.93,.72),hot)*(6.+hot*38.);
  }else if(mat==${SHOCK}.){
    a=exp(-pow((r-.77)*11.,2.))*.64+exp(-r*r*8.)*.25;
    color=tint*(ambientLight(vec3(0.,1.,0.))*3.+uSunColor*.4)+vec3(1.,.8,.5)*exp(-r*r*8.)*3.;
  }else{
    vec2 p=q*3.9+center.xz*.346+vec2(uTime*.12,-uTime*.19);
    float turbulence=noise(p)*.63+noise(p*2.03)*.26+noise(p*4.07)*.11;
    a=(1.-smoothstep(.26,.97,r+(turbulence-.52)*.40))*mix(.45,1.,turbulence);
    vec2 grad=vec2(noise(p+vec2(.35,0.))-noise(p-vec2(.35,0.)),noise(p+vec2(0.,.35))-noise(p-vec2(0.,.35)));
    vec3 nq=normalize(vec3(q*.75+grad*1.6,max(.2,1.-r*r)));
    vec3 n=normalize(basis[0]*nq.x+basis[1]*nq.y+basis[2]*nq.z);
    float lit=saturate(dot(n,uSun)*.6+.4);
    float inner=.55+.45*turbulence;
    color=tint*(uSunColor*lit*.32*(uQuality>.5?cloudShadow(wPos,uSun):1.)+ambientLight(n)*1.25)*inner;
    color+=tint*uSunColor*pow(saturate(dot(normalize(wPos-uEye),uSun)),6.)*.5*(1.-a);
    if(mat==${SPIRIT}.){
      a=exp(-r*r*3.6)*(1.-smoothstep(.64,1.,r));
      color=tint*(2.6+3.*exp(-r*r*6.));
    }
  }
  color=aerial(color,wPos,0.);
  vec4 o=encodeOutput(color,0.);
  return vec4(o.rgb,saturate(a*fract(style.a)));
}
vec4 glassPane(vec3 n,vec3 v,float mat){
  if(dot(n,v)<0.)n=-n;
  float NoV=max(dot(n,v),0.);
  float F=.04+.96*pow5(1.-NoV);
  vec3 reflection=cityReflection(reflect(-v,n),0.);
  vec3 h=normalize(v+uSun);
  float NoL=max(dot(n,uSun),0.);
  vec3 glint=uSunColor*D_GGX(max(dot(n,h),0.),.0016)*V_SmithGGX(NoV,NoL,.0016)*F*NoL*sunShadow(wPos,n,NoL);
  float body=mat==${APARTMENT_GLASS}.?.025:.07;
  float alpha=saturate(F+body);
  vec3 tint=toLinear(style.rgb)*ambientLight(n)*.6;
  vec3 color=(reflection*F+glint+tint*body)/max(alpha,1e-3);
  float d=length(uEye-wPos);
  alpha*=1.-smoothstep(60.,320.,d)*.55;
  color=aerial(color,wPos,0.);
  vec4 o=encodeOutput(color,0.);
  return vec4(o.rgb,alpha);
}
vec3 bevelNormal(vec3 n,float strength){
  vec3 halfSize=extent*.5;
  float radius=min(.035,min(halfSize.x,min(halfSize.y,halfSize.z))*.35);
  if(radius<.004)return n;
  vec3 depth=halfSize-abs(localPos);
  vec3 near=(1.-smoothstep(0.,radius,depth))*sign(localPos)*(1.-abs(localNormal));
  if(dot(near,near)<1e-6)return n;
  return normalize(n+basis*near*.85*strength);
}
void main(){
  vec3 n=normalize(wNormal);
  beginShading(wPos,n);
  vec3 v=normalize(uEye-wPos);
  float dist=length(uEye-wPos);
  float mat=floor(style.a);
  bool airborne=mat>=${LIFT_MATERIAL_OFFSET}.;
  if(airborne)mat-=${LIFT_MATERIAL_OFFSET}.;
  if((mat>=${EXHAUST}.&&mat<=${SHOCK}.)||(mat==${IGNITION}.&&fract(style.a)>.01)){frag=effectColor(mat);return;}
  bool furnished=mat>=${ROOM_MATERIAL_OFFSET}.;
  if(furnished)mat-=${ROOM_MATERIAL_OFFSET}.;
  if(mat==22.||mat==${APARTMENT_GLASS}.){frag=glassPane(n,v,mat);return;}
  bool refitted=mat>=48.&&mat<=53.;
  vec3 base=style.rgb;
  if(mat>=26.&&mat<29.)base=surfaceColor;
  float footprint=max(length(dFdx(wPos)),length(dFdy(wPos)));
  int code=int(round(fract(style.a)*${APPEARANCE_SCALE}.))%${APPEARANCE_SCALE/4}-1;
  bool varied=code>=0&&code<${eraProfiles.length*64};
  int era=varied?code/64:3,pattern=varied?code%8:0;
  float weather=varied?float((code/8)%8)/7.:0.;
  vec4 proportions=eraProfiles[era],opening=windowProfiles[pattern];
  bool groundLike=mat==1.||mat==2.||mat==3.||mat==9.||(mat>=26.&&mat<29.)||(mat>=35.&&mat<=38.)||mat==47.;
  if(uKind==${KIND_IDS.box}&&!groundLike&&footprint<.06)n=bevelNormal(n,1.-smoothstep(.03,.06,footprint));
  vec3 geometryNormal=n;
  float roughness,cavity;
  base=facadeMaterial(base,n,int(mat),era,footprint,roughness,cavity);
  float metal=0.,f0=.04,translucency=0.,sheen=0.,occlusion=cavity,windowMask=0.,share;
  vec3 emission=vec3(0.),windowColor=vec3(0.);
  bool water=false;

  if(mat==${HEAT_METAL}.){metal=.75;roughness=min(roughness,.42);}
  if(mat==${IGNITION}.){
    float flare=.78+.15*sin(uTime*76.+center.x*.47+localPos.y*.81)+.08*sin(uTime*116.+localPos.y*2.7);
    emission+=toLinear(base)*max(.48,flare)*14.;
  }
  if(refitted&&uMaterialDetail<.5)base*=.96+noise(wPos.xz*1.25+wPos.y*.69)*.085;
  float grain=.5;
  if(footprint<.26)grain+=(noise(wPos.xz*8.+wPos.y*.91)-.5)*.65*(1.-smoothstep(.045,.26,footprint));
  if(footprint<.08)grain+=(noise(wPos.xz*27.-wPos.y*2.)-.5)*.35*(1.-smoothstep(.018,.08,footprint));
  base*=.966+grain*.065;

  // Weathering: rain streaks under ledges, splash at the base and soot near the ground.
  if(weather>0.&&abs(localNormal.y)<.66&&mat!=10.){
    float along=abs(localNormal.z)>.5?wPos.x:wPos.z;
    vec2 wall=vec2(along,wPos.y);
    float lower=1.-smoothstep(.12,3.0,localPos.y+extent.y*.5);
    float visible=1.-smoothstep(.14,.75,footprint);
    float stain=noise(wall*vec2(.81,.23));
    float rain=smoothstep(.48,.83,noise(wall*vec2(3.6,.14)))*smoothstep(.2,.8,noise(wall*vec2(.4,.05)));
    base*=1.-weather*(.05+lower*.10+visible*(stain*.13+rain*(pattern<4?.20:.10)));
    if(pattern==2||pattern==5){
      float zigzag=wall.x*.43+wall.y*(pattern==2?.31:-.25)+noise(wall*vec2(1.8,.67))*.27;
      float fissure=1.-smoothstep(.007,.024+footprint*.4,abs(fract(zigzag)-.5));
      float broken=smoothstep(.55,.80,noise(wall*vec2(.28,.39)));
      base*=1.-weather*fissure*broken*.39*(1.-smoothstep(.04,.18,footprint));
    }
    if(pattern==4||pattern==7)base=mix(base,base*vec3(.84,1.03,.79),weather*lower*.62);
  }

  // Ground surfaces.
  if(mat==1.||mat==28.||mat==38.){
    base*=.98+noise(wPos.xz*.56)*.035;
    float dirt=smoothstep(.45,.85,noise(wPos.xz*.21))*.12+smoothstep(.6,.9,noise(wPos.xz*1.7))*.06;
    base*=1.-dirt;roughness=max(roughness,.78);
  }
  if(mat==2.||mat==27.||mat==37.){
    vec2 p=wPos.xz;
    base*=.955+noise(p*.31)*.065;
    float blotch=smoothstep(.35,.75,noise(p*.09))*.08+smoothstep(.55,.85,noise(p*.6+7.))*.05;
    base*=1.-blotch;
    float near=1.-smoothstep(.02,.12,footprint);
    float crack=(1.-smoothstep(.0,.014,abs(noise(p*.55)-.5)))*smoothstep(.6,.8,noise(p*.13))*near;
    base*=1.-crack*.4;
    float stain=smoothstep(.66,.92,noise(p*.38+3.))*.14;
    base*=1.-stain;
    roughness=clamp(roughness*.95+.03-stain*.35,.45,.95);
    occlusion*=1.-crack*.5;
  }
  if(mat==9.||mat==26.||mat==47.){
    vec2 p=wPos.xz;
    float patches=noise(p*.045),clumps=noise(p*.62),blades=noise(p*7.3+wPos.y);
    vec3 dry=base*vec3(1.18,1.05,.72),lush=base*vec3(.86,1.06,.86);
    base=mix(lush,dry,smoothstep(.45,.8,patches)*.65);
    base*=.82+clumps*.26;
    float near=1.-smoothstep(.03,.2,footprint);
    base*=mix(1.,.78+blades*.4,near);
    vec2 slope=vec2(noise(p*5.1)-.5,noise(p*5.1+9.)-.5)*.35*near;
    n=normalize(n+vec3(slope.x,0.,slope.y));
    roughness=.92;sheen=.6;occlusion*=mix(1.,.7+blades*.3,near);
    float rock=smoothstep(.11,.38,1.-geometryNormal.y)*smoothstep(21.,46.,wPos.y);
    base=mix(base,vec3(.42,.41,.38)*(.77+noise(p*.56+wPos.y*.26)*.32),rock*.7);
    if(rock>.5){sheen=0.;roughness=.8;}
  }
  if(mat==35.||mat==36.){roughness=.95;occlusion*=.9+.1*grain;}

  // Water: reflections of the city and the sky with layered waves.
  vec3 waterColor=vec3(0.);
  if(mat==3.){
    water=true;
    vec2 p=wPos.xz;
    float waves=1.-smoothstep(.30,1.9,footprint),ripples=1.-smoothstep(.092,.51,footprint);
    vec2 swell=vec2(sin(dot(p,vec2(.24,.49))+uTime*.66),cos(dot(p,vec2(.51,-.14))+uTime*.72));
    vec2 wave=vec2(sin(p.x*1.6+p.y*.8+uTime*1.3),cos(p.y*1.8-p.x*.9+uTime*1.1));
    vec2 ripple=vec2(noise(p*3.1+uTime*vec2(.9,.4))-.5,noise(p*3.1+vec2(5.,2.)-uTime*vec2(.5,.8))-.5);
    float swells=1.-smoothstep(2.5,9.,footprint);
    vec2 slope=swell*.026*swells+wave*.04*waves+ripple*.11*ripples;
    vec3 wn=normalize(vec3(slope.x,1.,slope.y));
    float NoV=max(dot(wn,v),1e-3);
    float F=.02+.98*pow5(1.-NoV);
    vec3 r=reflect(-v,wn);
    vec3 reflection=environment(r,.04);
    vec3 body=toLinear(base)*.16*(uAmbUp*2.5+uSunColor*max(uSun.y,0.)*.35)*(uQuality>.5?cloudShadow(wPos,uSun):1.);
    float NoL=max(dot(wn,uSun),0.);
    vec3 h=normalize(v+uSun);
    float a=.03;
    vec3 sunSpec=uSunColor*D_GGX(max(dot(wn,h),0.),a*a)*V_SmithGGX(NoV,NoL,a*a)*F*NoL*sunShadow(wPos,vec3(0.,1.,0.),NoL);
    waterColor=mix(body,reflection,F)+sunSpec;
  }

  // Facades: window grid with recessed jambs, glass reflections and the rooms behind.
  bool facade=mat==4.||mat==5.||mat==8.||mat==11.||mat==12.||mat==13.||mat==17.||mat==19.||mat==20.||mat==21.||refitted;
  if(facade){
    bool curtainWall=mat==19.||mat==21.,fins=mat==21.,limestone=mat==20.;
    bool glass=mat==4.||curtainWall,shop=mat==11.,balcony=mat==12.,stone=mat==8.||limestone,brick=mat==13.,sand=mat==17.;
    bool front=abs(localNormal.z)>.5;
    vec2 p=vec2(front?localPos.x:localPos.z,localPos.y);
    vec2 span=vec2(front?extent.x:extent.z,extent.y);
    p+=span*.5;
    float wide=curtainWall?(fins?2.7:1.77):shop?2.13:(glass?1.59:(balcony?2.7:(stone?2.35:(sand?1.87:2.08))));
    float tall=curtainWall?4.56:limestone?4.10:shop?4.26:(balcony?3.77:(stone?3.90:3.68));
    if(varied){wide*=proportions.x*opening.x;tall*=proportions.y;}
    vec2 count=max(vec2(1),floor(span/vec2(wide,tall)));
    vec2 grid=p/max(span,vec2(.01))*count,f=fract(grid);
    vec2 cellSize=span/count;
    float margin=curtainWall?(fins?.17:.040):shop?.08:(glass?.065:(balcony?.17:(sand?.31:.23)));
    float bottom=curtainWall?.12:shop?.06:(balcony?.18:.24);
    float top=shop?.70:(glass?.88:(balcony?.87:(sand?.71:.83)));
    if(varied){
      margin=clamp(margin+opening.y,.035,.42);
      bottom=clamp(bottom+opening.z,.05,.32);
      top=clamp(top+float(era-2)*.012,.65,.94);
    }
    vec2 cellFootprint=fwidth(grid);
    float vertical=step(abs(localNormal.y),.48);
    float vis=vertical*(1.-smoothstep(.44,1.12,max(cellFootprint.x,cellFootprint.y)));
    bool arch=varied&&era<2&&!glass&&!shop&&(pattern==0||pattern==2||pattern==6);
    float border=windowBorder(f,margin,bottom,top,arch);
    float casing=(1.-smoothstep(.00,.029,border))*vis;
    float pane=(1.-smoothstep(-.040,-.016,border))*vis;
    vec3 along=front?basis[0]:basis[2];
    vec3 up=basis[1];
    vec3 ray=vec3(dot(-v,along),dot(-v,up),max(dot(v,geometryNormal),.02));
    float recess=varied?proportions.z*(curtainWall?.25:.46):curtainWall?.027:.106;
    vec2 parallax=clamp(ray.xy/ray.z,-2.,2.);
    vec2 back=f+parallax*vec2(recess/cellSize.x*1.6,recess/cellSize.y*1.6);
    float backBorder=windowBorder(back,margin,bottom,top,arch);
    float reveal=(1.-smoothstep(-.008,.025,backBorder))*pane;
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
    // Floor slabs and spandrels read as horizontal bands on modern glass.
    if(curtainWall){
      float band=(1.-smoothstep(.08,.17,abs(f.y-.08)))*vis;
      base=mix(base,style.rgb*.52+.035,band);
      roughness=mix(roughness,.35,band);metal=mix(metal,.6,band);
    }
    if(shop){
      float fascia=smoothstep(.76,.81,f.y)*(1.-smoothstep(.93,.96,f.y))*vis;
      base=mix(base,style.rgb*.57+.07,fascia);
    }
    if(fins)base+=vis*(1.-smoothstep(.045,.16,abs(f.x-.5)))*style.rgb*.24;
    // Frame and jamb.
    vec3 frameColor=glass?style.rgb*.42+.05:(stone?base*1.08:base*.82+vec3(.07));
    base=mix(base,frameColor,(casing-pane)*.9);
    float jamb=pane*(1.-reveal);
    base=mix(base,base*.78,jamb);
    occlusion*=1.-jamb*.45;
    float sill=(1.-smoothstep(.016,.037,abs(f.y-bottom+.04)))*step(abs(f.x-.5),.53-margin)*vis;
    base+=vec3(.18,.16,.12)*sill*(glass?.16:varied?.37+proportions.w:.48);
    if(reveal>.003&&uQuality>.5){
      vec2 cell=floor(grid);
      vec2 seed=floor(center.xz*.19)+vec2(front?7.:19.,localNormal.z*3.+localNormal.x*5.);
      vec3 sunLocal=vec3(dot(uSun,along),dot(uSun,up),-dot(uSun,geometryNormal));
      float curtains;
      float office=glass||shop?1.:0.;
      vec3 inside=interiorRadiance(cell,f,cellSize,ray,sunLocal,office,vec4(margin,bottom,top,0.),seed,curtains);
      vec2 paneSeed=cell+seed*3.1;
      vec3 jitter=(vec3(hash(paneSeed+3.1),hash(paneSeed+7.7),hash(paneSeed+1.3))-.5)*.03;
      vec3 gn=normalize(geometryNormal+jitter);
      float NoV=max(dot(gn,v),1e-3);
      float coat=curtainWall?.10:glass?.07:shop?.045:.04;
      float F=coat+(1.-coat)*pow5(1.-NoV);
      vec3 reflection=cityReflection(reflect(-v,gn),0.);
      float NoL=max(dot(gn,uSun),0.);
      vec3 h=normalize(v+uSun);
      vec3 glint=uSunColor*D_GGX(max(dot(gn,h),0.),.0012)*V_SmithGGX(NoV,NoL,.0012)*F*NoL;
      float transmit=curtainWall?.45:glass?.62:.86;
      vec3 tint=curtainWall?mix(vec3(1.),toLinear(style.rgb)*2.2,.45):vec3(1.);
      float middle=1.-smoothstep(.010,varied&&era<3?.040:.033,abs(f.x-.50));
      float rail=1.-smoothstep(.012,.032,abs(f.y-mix(bottom,top,varied?opening.w:.50)));
      float mullion=saturate(middle*(glass?.6:1.)+rail*(stone?1.:.6));
      windowColor=inside*transmit*tint*(1.-F)+reflection*F+glint*sunShadow(wPos,gn,NoL);
      windowMask=reveal*(1.-mullion);
      base=mix(base,frameColor*.9,reveal*mullion);
    }else if(reveal>.003){
      float F=.04+.96*pow5(1.-max(dot(geometryNormal,v),0.));
      windowColor=mix(vec3(.012,.014,.016)*ambientLight(geometryNormal)*20.,cityReflection(reflect(-v,geometryNormal),.1),F);
      windowMask=reveal;
    }
    // Distant facades keep the average tone of their glazing.
    float area=(1.-2.*margin)*(top-bottom);
    float far=vertical*(1.-vis)*area;
    if(far>0.){
      vec3 avgWindow=mix(vec3(.025,.03,.035),cityReflection(reflect(-v,geometryNormal),.3),.18+.5*pow5(1.-max(dot(geometryNormal,v),0.)));
      windowColor=mix(windowColor,avgWindow,far/max(far+windowMask,1e-4));
      windowMask=max(windowMask,far*(glass?.95:.75));
    }
    if(geometryNormal.y>.9&&!shop){
      float flat_=noise(wPos.xz*.37);
      base=mix(base,vec3(.42,.42,.41)*(.85+.25*flat_),.75);
      roughness=.88;
    }
    roughness=min(roughness,glass?.5:roughness);
  }
  if(mat==10.){
    vec3 r=reflect(-v,n);
    if(varied&&abs(n.y)<.55&&uQuality>.5){
      bool frontQuad=abs(localNormal.z)>.5;
      vec3 along=frontQuad?basis[0]:basis[2];
      vec2 size=vec2(frontQuad?extent.x:extent.z,extent.y);
      vec2 uv=vec2(frontQuad?localPos.x:localPos.z,localPos.y)/max(size,vec2(.06))+.5;
      vec2 cellSize=size/vec2(.785,.684);
      vec2 f=vec2(.1075,.198)+uv*vec2(.785,.684);
      vec3 ray=vec3(dot(-v,along),dot(-v,basis[1]),max(abs(dot(v,n)),.02));
      vec3 sunLocal=vec3(dot(uSun,along),dot(uSun,basis[1]),-dot(uSun,n));
      vec2 cell=vec2(floor(center.x*.41+center.z*.53),floor(center.y/3.6));
      float curtains;
      vec3 inside=interiorRadiance(cell,f,cellSize,ray,sunLocal,0.,vec4(.1075,.198,.882,0.),center.xz*.07,curtains);
      float NoV=max(abs(dot(n,v)),1e-3);
      float F=.04+.96*pow5(1.-NoV);
      float NoL=max(dot(n,uSun),0.);
      vec3 h=normalize(v+uSun);
      vec3 glint=uSunColor*D_GGX(max(dot(n,h),0.),.0012)*V_SmithGGX(NoV,NoL,.0012)*F*NoL;
      windowColor=inside*.86*(1.-F)+cityReflection(r,0.)*F+glint*sunShadow(wPos,n,NoL);
      windowMask=1.;
    }else{
      float NoV=max(dot(n,v),1e-3);
      float F=.05+.95*pow5(1.-NoV);
      vec3 darkInterior=toLinear(base)*.05*ambientLight(n);
      float NoL=max(dot(n,uSun),0.);
      vec3 h=normalize(v+uSun);
      vec3 glint=uSunColor*D_GGX(max(dot(n,h),0.),.004)*V_SmithGGX(NoV,NoL,.004)*F*NoL;
      windowColor=darkInterior*(1.-F)+cityReflection(r,.04)*F+glint*sunShadow(wPos,n,NoL);
      windowMask=1.;
    }
  }
  if(mat==14.&&uMaterialDetail<.5){
    vec2 tile=vec2(localPos.x*4.+.5*floor(localPos.z*2.6),localPos.z*2.6);
    base*=.98+(sin(tile.x*6.283)*.026-(1.-smoothstep(.015,.095,fract(tile.y)))*.055)*(1.-smoothstep(.07,.24,footprint));
  }
  if(mat==14.)roughness=min(roughness,.62);
  if(mat==15.){base*=.53+smoothstep(.18,.33,abs(fract(localPos.x*6.8)-.5))*.45;roughness=.4;metal=.4;}
  if(mat==16.&&uMaterialDetail<.5){
    vec2 st=wPos.xz;
    vec2 tile=fract(st*11.2+vec2(floor(st.y*11.2)*.47,0.));
    base*=.91+.14*grain-.14*(1.-smoothstep(.032,.097,min(tile.x,tile.y)))*(1.-smoothstep(.025,.11,footprint));
  }
  if(mat==18.&&uMaterialDetail<.5)base*=.96+noise(wPos.xz*.9+wPos.y*.18)*.065;
  if(mat==23.){
    if(uMaterialDetail<.5){
      vec2 p=wPos.xz*vec2(.89,.54)+wPos.y*.47;
      float vein=pow(.5+.5*sin(p.x*4.+p.y*2.+noise(p*1.7)*5.),11.);
      base*=.97+grain*.035-vein*.045;
    }
    roughness=.14;f0=.05;
  }
  if(mat==24.){
    if(uMaterialDetail<.5){
      float grainLine=noise(vec2(localPos.x*.4+localPos.y*.83,localPos.z*17.+localPos.x*8.));
      base*=.74+.34*grainLine;
    }
    roughness=clamp(roughness,.42,.7);
  }
  if(mat==25.){
    if(uMaterialDetail<.5){
      float seam=1.-smoothstep(.018,.069,abs(fract(localPos.x*1.11+localPos.z*1.17)-.50));
      base*=.92+grain*.14-.26*seam;
    }
    roughness=clamp(roughness*.7,.22,.55);metal=.25;f0=.05;
  }
  if(mat==${AIRCRAFT}.){roughness=.3;f0=.05;}
  if(mat==${CERAMIC_SHELL}.){roughness=.16;f0=.05;}
  if(mat==42.)roughness=.85;
  if(mat==41.){sheen=.9;roughness=.95;}
  if(mat==44.){roughness=.18;f0=.05;}
  if(mat==46.||mat==50.){metal=.65;roughness=clamp(roughness,.3,.55);}
  if(mat==53.){metal=.35;roughness=.55;}
  if(mat==49.){roughness=.3;}
  if(mat==${SHIELD_TILE}.){roughness=.55;}
  if(mat==${LEATHER}.){roughness=.55;sheen=.5;}
  if(mat==${PAPER}.){roughness=.9;translucency=.25;}
  if(mat==${SOOT}.){roughness=.95;}

  // Foliage: clumps of leaves bulge out of the canopy, the gaps between them stay dark,
  // and thin leaves let sunlight through when the tree is backlit.
  if(mat==6.||mat==45.){
    vec3 outward=uKind==${KIND_IDS.ball}?normalize(wPos-center):geometryNormal;
    float near=1.-smoothstep(.04,.35,footprint);
    vec4 clump=cellular(wPos*2.3+center*.7);
    vec4 small=cellular(wPos*6.1+center.zxy);
    vec3 bulge=normalize(clump.yzw+outward*.35);
    n=normalize(mix(n,bulge,.75*(.35+.65*near)));
    n=normalize(n+normalize(small.yzw)*.3*near);
    float gap=smoothstep(.28,.62,clump.x);
    float speck=noise3(wPos*11.+center);
    float patches=noise(wPos.xz*.127);
    base*=(.78+speck*.3*near)*(1.-.45*gap)*(.92+patches*.16);
    base=mix(base,base*vec3(1.15,1.1,.72),smoothstep(.6,.9,speck)*.3*near);
    occlusion*=mix(.42,1.,saturate(outward.y*.5+.6))*(1.-.55*gap);
    roughness=.72;translucency=.9;sheen=.2;
    if(uKind==${KIND_IDS.tube}){
      float leaflet=smoothstep(.2,.5,abs(fract(localPos.y*9.+localPos.x*4.)-.5));
      base*=.75+.35*leaflet;
    }
  }
  if(uKind==${KIND_IDS.tube}&&mat==0.&&style.r>style.b*1.15&&extent.y>1.6&&extent.x<1.2){
    float a=atan(localPos.z,localPos.x);
    float bark=noise(vec2(a*6.,localPos.y*1.7))*.6+noise(vec2(a*18.,localPos.y*5.))*.4;
    base*=.6+bark*.6;
    roughness=.95;occlusion*=.75+.25*bark;
  }
  if(mat==7.){
    emission+=toLinear(base)*(2.2+uNight*6.);
    if(uUnderground>.5)emission*=2.6;
  }
  if(mat>=${SIGNAL_GREEN}.&&mat<=${SIGNAL_RED}.){
    float lit=1.-step(.5,abs(mat-uSignal));
    emission+=toLinear(base)*lit*7.;
    base*=mix(.12,.5,lit);roughness=.2;
  }
  if(mat==${STREET_LAMP}.){
    emission+=toLinear(base)*smoothstep(.16,.65,uNight)*6.;
    base*=.54;roughness=.25;
  }

  vec3 albedo=toLinear(base);
  if(furnished){
    vec3 E=(uAmbSun+uAmbAnti+uAmbUp)*.75*vec3(1.06,1.,.92)+vec3(1.,.88,.72)*.03;
    float NoV=max(dot(n,v),0.);
    vec3 color=albedo*E*occlusion*(.82+.18*n.y)+albedo*uSunColor*max(dot(n,uSun),0.)*.05;
    color+=environment(reflect(-v,n),roughness)*envBRDF(vec3(f0),roughness,NoV)*.4;
    if(sheen>0.)color+=albedo*E*sheen*pow(1.-NoV,3.)*.5;
    color=aerial(color+emission,wPos,0.);
    frag=encodeOutput(color,.85);
    return;
  }
  vec3 color;
  if(water){
    color=waterColor;share=.5;
  }else{
    float NoL=max(dot(n,uSun),0.);
    float shadow=uUnderground>.5?0.:sunShadow(wPos,geometryNormal,max(dot(geometryNormal,uSun),0.));
    if(uUnderground<.5&&uQuality>.5)shadow*=cloudShadow(wPos,uSun);
    color=shadeSurface(albedo,n,v,roughness,metal,f0,shadow,occlusion,translucency,sheen,share);
    if(windowMask>0.){
      color=mix(color,windowColor,windowMask);
      share*=1.-windowMask*.85;
    }
  }
  color+=emission;
  float edge=0.;
  if(groundLike||mat==35.||mat==36.||mat==38.){
    float fadeStart=mat==3.?.24:.58;
    edge=smoothstep(fadeStart,.80,length(uEye.xz-wPos.xz)/uViewRadius);
  }
  vec2 boundary=vec2(4000.,3000.)-abs(wPos.xz);
  edge=max(edge,1.-smoothstep(0.,113.,min(boundary.x,boundary.y)));
  if(mat==${AIRCRAFT}.||airborne)edge=min(edge,.5);
  color=aerial(color,wPos,edge);
  frag=encodeOutput(color,share);
}`;

export const skyVertex=`#version 300 es
out vec2 screen;
void main(){
  screen=vec2((gl_VertexID<<1)&2,gl_VertexID&2)*2.-1.;
  gl_Position=vec4(screen,1.,1.);
}`;

export const skyFragment=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
in vec2 screen;
uniform vec3 uRight,uUp,uForward;
uniform float uRatio;
uniform vec2 uJitter;
out vec4 frag;
${glslLighting}
vec4 cloudLayer(vec3 d){
  if(d.y<.012)return vec4(0.);
  float t=(CLOUD_Y-uEye.y)/d.y;
  vec2 xz=uEye.xz+d.xz*t;
  int octaves=t>16000.?2:t>7000.?3:5;
  float density=cloudField(xz,octaves);
  if(density<.003)return vec4(0.);
  vec2 toward=normalize(uSun.xz+vec2(1e-4));
  float lee=cloudField(xz+toward*300.,2);
  float mu=dot(d,uSun);
  float lit=exp(-lee*2.2);
  float thin=1.-density;
  float silver=phaseHG(mu,.72)*4.*PI;
  vec3 sunLit=uSunColor*(.30*lit*(1.-.35*density)+.06*silver*thin*lit);
  float underside=smoothstep(.12,.75,d.y)*density;
  vec3 ambient=(uAmbUp*PI*.42+uGroundRad*PI*.55)*(1.-.35*underside);
  vec3 color=sunLit*(1.-.55*underside)+ambient;
  float alpha=(1.-exp(-density*5.))*smoothstep(.012,.07,d.y)*(1.-smoothstep(20000.,34000.,t));
  float far=1.-exp(-t*.00007);
  color=mix(color,skyLUT(d),far*.75);
  return vec4(color,alpha);
}
void main(){
  vec2 s=screen+uJitter;
  vec3 d=normalize(uForward+(uRight*s.x*uRatio+uUp*s.y)*.589);
  vec3 color;
  if(uUnderground>.5){
    color=uAmbUp*1.1;
  }else{
    color=d.y<0.?distantBackdrop(d):skyLUT(d);
    float mu=dot(d,uSun);
    float disk=smoothstep(.99995,.999985,mu);
    color+=uSunColor*disk*1600.;
    vec4 c=cloudLayer(d);
    color=mix(color,c.rgb,c.a);
    color=oceanHorizon(color,d);
  }
  frag=encodeOutput(color,0.);
}`;
