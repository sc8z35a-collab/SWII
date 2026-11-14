// Shared shading code for the WebGL 2 renderer: hashing and noise, physically based
// BRDF terms, a single-scattering atmosphere, the cloud layer and the tone curve.
// The same atmosphere runs in JavaScript to derive the sun color and the sky ambience.

export const CLOUD_ALTITUDE=1650;
export const SKY_LUT_SIZE=[256,128];

export const glslCommon=`
#define PI 3.14159265
float saturate(float x){return clamp(x,0.,1.);}
vec3 saturate(vec3 x){return clamp(x,0.,1.);}
float luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float pow5(float x){float y=x*x;return y*y*x;}
uint ihash(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
float hash(vec2 p){
  ivec2 i=ivec2(floor(p))+ivec2(1048576);
  return float(ihash(uint(i.x)^ihash(uint(i.y)+0x9e3779b9u)))*(1./4294967296.);
}
float hash3(vec3 p){
  ivec3 i=ivec3(floor(p))+ivec3(1048576);
  return float(ihash(uint(i.x)^ihash(uint(i.y)^ihash(uint(i.z)+0x632be5abu))))*(1./4294967296.);
}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  float a=mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y);
  float b=mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+1.),f.x),f.y);
  return mix(a,b,f.z);
}
vec3 hash33(vec3 p){
  ivec3 i=ivec3(floor(p))+ivec3(1048576);
  uint h=ihash(uint(i.x)^ihash(uint(i.y)^ihash(uint(i.z)+0x632be5abu)));
  uint h2=ihash(h),h3=ihash(h2);
  return vec3(float(h),float(h2),float(h3))*(1./4294967296.);
}
// Nearest of eight jittered points: x = distance, yzw = direction from that point.
vec4 cellular(vec3 p){
  vec3 base=floor(p-.5);
  float best=9.;vec3 dir=vec3(0.,1.,0.);
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec3 cell=base+vec3(x,y,z);
    vec3 point=cell+.15+.7*hash33(cell);
    vec3 d=p-point;
    float l=dot(d,d);
    if(l<best){best=l;dir=d;}
  }
  return vec4(sqrt(best),dir);
}
float fbm(vec2 p,int octaves){
  float sum=0.,amp=.5;
  for(int i=0;i<6;i++){
    if(i>=octaves)break;
    sum+=amp*noise(p);p=p*2.03+vec2(1.7,9.2);amp*=.5;
  }
  return sum;
}
float ign(vec2 pixel){return fract(52.9829189*fract(dot(pixel,vec2(.06711056,.00583715))));}
`;

export const glslBRDF=`
float D_GGX(float NoH,float a){
  float a2=a*a,f=(NoH*a2-NoH)*NoH+1.;
  return a2/(PI*f*f+1e-7);
}
float V_SmithGGX(float NoV,float NoL,float a){
  float a2=a*a;
  float l=NoV*sqrt((-NoL*a2+NoL)*NoL+a2),v=NoL*sqrt((-NoV*a2+NoV)*NoV+a2);
  return .5/(l+v+1e-5);
}
vec3 F_Schlick(vec3 f0,float VoH){return f0+(1.-f0)*pow5(1.-VoH);}
vec3 envBRDF(vec3 f0,float roughness,float NoV){
  const vec4 c0=vec4(-1.,-.0275,-.572,.022),c1=vec4(1.,.0425,1.04,-.04);
  vec4 r=roughness*c0+c1;
  float a=min(r.x*r.x,exp2(-9.28*NoV))*r.x+r.y;
  vec2 ab=vec2(-1.04,1.04)*a+r.zw;
  return f0*ab.x+ab.y;
}
float phaseHG(float mu,float g){
  float g2=g*g;
  return (1.-g2)/(4.*PI*pow(max(1.+g2-2.*g*mu,1e-4),1.5));
}
`;

// The view direction is stored with a square-root elevation curve so the horizon,
// where the color changes fastest, receives most of the rows.
export const glslSkyLookup=`
uniform sampler2D uSkyLUT;
vec3 skyLUT(vec3 d){
  float az=atan(d.x,-d.z)*(.5/PI)+.5;
  float el=asin(clamp(d.y,-1.,1.));
  float v=.5+.5*sign(el)*sqrt(abs(el)/(PI*.5));
  return texture(uSkyLUT,vec2(az,clamp(v,.004,.996))).rgb;
}
`;

const atmosphereConstants=`
const float RG=6360e3,RT=6460e3;
const vec3 BETA_R=vec3(5.802e-6,13.558e-6,33.1e-6);
const vec3 BETA_OZ=vec3(.650e-6,1.881e-6,.085e-6);
`;

export const skyLutFragment=`#version 300 es
precision highp float;
precision highp int;
uniform vec3 uSun,uMieScatter,uMultiScatter,uGroundAlbedo;
uniform float uMieAbsorb;
uniform vec2 uSize;
out vec4 frag;
${glslCommon}
${glslBRDF}
${atmosphereConstants}
vec2 sphere(vec3 ro,vec3 rd,float r){
  float b=dot(ro,rd),c=dot(ro,ro)-r*r,d=b*b-c;
  if(d<0.)return vec2(-1.);
  d=sqrt(d);return vec2(-b-d,-b+d);
}
vec3 extinctionAt(float h){
  float r=exp(-h/8000.),m=exp(-h/1200.),o=max(0.,1.-abs(h-25000.)/15000.);
  return BETA_R*r+(uMieScatter+uMieAbsorb)*m+BETA_OZ*o;
}
vec3 sunTransmittance(vec3 p){
  if(sphere(p,uSun,RG).x>0.)return vec3(0.);
  float t=sphere(p,uSun,RT).y,dt=t/8.;
  vec3 depth=vec3(0.);
  for(int i=0;i<8;i++)depth+=extinctionAt(length(p+uSun*(float(i)+.5)*dt)-RG)*dt;
  return exp(-depth);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uSize;
  float az=(uv.x-.5)*2.*PI,s=uv.y-.5;
  float el=sign(s)*4.*s*s*PI*.5;
  vec3 dir=vec3(cos(el)*sin(az),sin(el),-cos(el)*cos(az));
  vec3 ro=vec3(0.,RG+60.,0.);
  float tMax=sphere(ro,dir,RT).y;
  vec2 ground=sphere(ro,dir,RG);
  bool hitsGround=ground.x>0.;
  if(hitsGround)tMax=ground.x;
  float mu=dot(dir,uSun);
  float pr=3./(16.*PI)*(1.+mu*mu);
  float pm=phaseHG(mu,.8)*.75+phaseHG(mu,.3)*.25;
  vec3 depth=vec3(0.),rayleigh=vec3(0.),mie=vec3(0.),multiple=vec3(0.);
  float previous=0.;
  const int N=24;
  for(int i=0;i<N;i++){
    float next=tMax*pow((float(i)+1.)/float(N),2.),dt=next-previous,t=previous+dt*.5;
    previous=next;
    vec3 p=ro+dir*t;
    float h=length(p)-RG;
    float r=exp(-h/8000.),m=exp(-h/1200.);
    vec3 ext=extinctionAt(h);
    vec3 T=exp(-(depth+ext*dt*.5));
    vec3 sunT=sunTransmittance(p);
    rayleigh+=T*sunT*r*dt;
    mie+=T*sunT*m*dt;
    multiple+=T*(BETA_R*r+uMieScatter*m)*dt;
    depth+=ext*dt;
  }
  vec3 radiance=rayleigh*BETA_R*pr+mie*uMieScatter*pm+multiple*uMultiScatter;
  if(hitsGround)radiance+=exp(-depth)*uGroundAlbedo*sunTransmittance(ro+dir*tMax)*max(uSun.y,0.)/PI;
  frag=vec4(radiance,1.);
}
`;

// Fair-weather cumulus on a single layer. Domain warping breaks the lattice and the
// sample toward the sun darkens the lee side of each cloud.
export const glslClouds=`
uniform vec2 uCloudOffset;
uniform float uCloudCover;
const float CLOUD_Y=${CLOUD_ALTITUDE.toFixed(1)};
float cloudField(vec2 xz,int octaves){
  vec2 p=(xz+uCloudOffset)*.00058;
  vec2 warp=vec2(noise(p*.45+3.1),noise(p*.45+vec2(9.7,1.3)))-.5;
  p+=warp*.55;
  float base=noise(p)*.6+noise(p*2.07+vec2(1.7,4.2))*.4;
  float erosion=octaves>1?fbm(p*4.3+vec2(5.,2.),octaves-1)*1.15:.48;
  float shape=base-erosion*.32;
  float threshold=mix(.62,.20,uCloudCover);
  return smoothstep(threshold,threshold+.17,shape);
}
float cloudShadow(vec3 p,vec3 sun){
  vec2 xz=p.xz+sun.xz/max(sun.y,.25)*(CLOUD_Y-p.y);
  return 1.-.66*smoothstep(.02,.5,cloudField(xz,2));
}
// Hazy land beyond the loaded city: the horizon color darkening slightly with depression.
vec3 distantBackdrop(vec3 d){
  vec3 horizon=skyLUT(vec3(d.x,.012,d.z));
  return mix(horizon,horizon*.66+uGroundRad*.9,smoothstep(.0,-.3,d.y));
}
`;

export const glslTonemap=`
vec3 acesFitted(vec3 color){
  const mat3 inputMatrix=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
  const mat3 outputMatrix=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
  color=inputMatrix*color;
  vec3 a=color*(color+.0245786)-.000090537,b=color*(.983729*color+.4329510)+.238081;
  return saturate(outputMatrix*(a/b));
}
vec3 linearToSrgb(vec3 c){
  c=saturate(c);
  return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));
}
vec3 grade(vec3 c){
  float l=luminance(c);
  c=mix(vec3(l),c,1.06);
  vec3 shadows=vec3(1.01,1.0,.985),highlights=vec3(1.035,1.0,.955);
  c*=mix(shadows,highlights,smoothstep(.05,.6,l));
  return max(c,0.);
}
`;

// ---------------------------------------------------------------------------
// JavaScript port used once per lighting change.
const RG=6360e3,RT=6460e3;
const BETA_R=[5.802e-6,13.558e-6,33.1e-6],BETA_OZ=[.650e-6,1.881e-6,.085e-6];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function sphere(ro,rd,r){
  const b=dot(ro,rd),c=dot(ro,ro)-r*r,d=b*b-c;
  if(d<0)return null;
  const s=Math.sqrt(d);
  return [-b-s,-b+s];
}
const hg=(mu,g)=>(1-g*g)/(4*Math.PI*Math.pow(Math.max(1+g*g-2*g*mu,1e-4),1.5));

export function atmosphereParameters(light){
  const haze=(light.haze??.0024)/.0024;
  const horizon=light.horizon??[.75,.82,.88];
  const mean=(horizon[0]+horizon[1]+horizon[2])/3||1;
  const tint=horizon.map(c=>Math.min(1.12,Math.max(.9,c/mean)));
  const density=2.0*haze*haze;
  return {
    mieScatter:tint.map(t=>3.996e-6*density*t*t),
    mieAbsorb:.444e-6*density,
    groundAlbedo:[.16,.15,.13]
  };
}

export function skyModel(light){
  const sun=light.sun,params=atmosphereParameters(light);
  const {mieScatter,mieAbsorb,groundAlbedo}=params;
  const extinction=h=>{
    const r=Math.exp(-h/8000),m=Math.exp(-h/1200),o=Math.max(0,1-Math.abs(h-25000)/15000);
    return [0,1,2].map(i=>BETA_R[i]*r+(mieScatter[i]+mieAbsorb)*m+BETA_OZ[i]*o);
  };
  const sunTransmittance=p=>{
    if((sphere(p,sun,RG)?.[0]??-1)>0)return [0,0,0];
    const t=sphere(p,sun,RT)[1],dt=t/8,depth=[0,0,0];
    for(let i=0;i<8;i++){
      const q=[p[0]+sun[0]*(i+.5)*dt,p[1]+sun[1]*(i+.5)*dt,p[2]+sun[2]*(i+.5)*dt];
      const e=extinction(Math.hypot(...q)-RG);
      for(let c=0;c<3;c++)depth[c]+=e[c]*dt;
    }
    return depth.map(d=>Math.exp(-d));
  };
  const ro=[0,RG+60,0];
  function radiance(dir,multiScatter=[0,0,0]){
    let tMax=sphere(ro,dir,RT)[1];
    const ground=sphere(ro,dir,RG),hitsGround=ground&&ground[0]>0;
    if(hitsGround)tMax=ground[0];
    const mu=dot(dir,sun),pr=3/(16*Math.PI)*(1+mu*mu),pm=hg(mu,.8)*.75+hg(mu,.3)*.25;
    const depth=[0,0,0],out=[0,0,0];
    let previous=0;
    const N=16;
    for(let i=0;i<N;i++){
      const next=tMax*((i+1)/N)**2,dt=next-previous,t=previous+dt*.5;
      previous=next;
      const p=[ro[0]+dir[0]*t,ro[1]+dir[1]*t,ro[2]+dir[2]*t],h=Math.hypot(...p)-RG;
      const r=Math.exp(-h/8000),m=Math.exp(-h/1200),e=extinction(h),sunT=sunTransmittance(p);
      for(let c=0;c<3;c++){
        const T=Math.exp(-(depth[c]+e[c]*dt*.5));
        out[c]+=T*sunT[c]*(BETA_R[c]*r*pr+mieScatter[c]*m*pm)*dt+T*(BETA_R[c]*r+mieScatter[c]*m)*dt*multiScatter[c];
        depth[c]+=e[c]*dt;
      }
    }
    if(hitsGround){
      const sunT=sunTransmittance([ro[0]+dir[0]*tMax,ro[1]+dir[1]*tMax,ro[2]+dir[2]*tMax]);
      for(let c=0;c<3;c++)out[c]+=Math.exp(-depth[c])*groundAlbedo[c]*sunT[c]*Math.max(sun[1],0)/Math.PI;
    }
    return out;
  }
  const sunColor=sunTransmittance(ro);
  // Average single-scattered radiance stands in for the light that scatters a second time.
  const directions=[];
  const rows=6,columns=10;
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const el=(j+.5)/rows*Math.PI*.5,az=i/columns*Math.PI*2;
    directions.push([Math.cos(el)*Math.sin(az),Math.sin(el),-Math.cos(el)*Math.cos(az)]);
  }
  const first=directions.map(d=>radiance(d));
  const average=[0,1,2].map(c=>first.reduce((n,l)=>n+l[c],0)/first.length);
  const multiScatter=average.map(v=>v*1.6);
  const sky=directions.map(d=>radiance(d,multiScatter));
  const length=Math.hypot(sun[0],sun[2]);
  const toward=length>1e-4?[sun[0]/length,0,sun[2]/length]:[1,0,0];
  const step=(Math.PI*.5/rows)*(Math.PI*2/columns);
  const irradiance=normal=>{
    const out=[0,0,0];
    for(const [i,d] of directions.entries()){
      const w=Math.max(0,dot(normal,d))*Math.sqrt(Math.max(0,1-d[1]*d[1]))*step;
      for(let c=0;c<3;c++)out[c]+=sky[i][c]*w;
    }
    return out;
  };
  const skyUp=irradiance([0,1,0]);
  const groundRadiance=[0,1,2].map(c=>groundAlbedo[c]*(sunColor[c]*Math.max(sun[1],0)+skyUp[c])/Math.PI);
  const withGround=(normal,e)=>e.map((v,c)=>(v+groundRadiance[c]*Math.PI*(1-normal[1])*.5)/Math.PI);
  const horizontal=sign=>{
    const n=[toward[0]*sign,0,toward[2]*sign];
    return withGround(n,irradiance(n));
  };
  const flat=Math.sqrt(1-.02*.02);
  const away=radiance([-toward[0]*flat,.02,-toward[2]*flat],multiScatter);
  const horizon=radiance([toward[0]*flat,.02,toward[2]*flat],multiScatter).map((v,c)=>(v+away[c])*.5);
  return {
    sun,sunColor,multiScatter,groundRadiance,horizon,...params,
    radiance:d=>radiance(d,multiScatter),
    ambientUp:withGround([0,1,0],skyUp),
    ambientDown:withGround([0,-1,0],[0,0,0]),
    ambientSun:horizontal(1),
    ambientAnti:horizontal(-1)
  };
}
