import {glslCommon,glslTonemap} from './gfx-common.js';

// Screen space passes that run after the scene has been drawn into a linear HDR target:
// ambient occlusion, temporal antialiasing, bloom, tone mapping and grading.
const fullscreen=`#version 300 es
out vec2 uv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  uv=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;

const header=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 uv;
out vec4 frag;
${glslCommon}
`;

const decode=`
uniform float uEncoded;
vec4 sceneSample(sampler2D s,vec2 t){
  vec4 c=textureLod(s,t,0.);
  if(uEncoded>.5){vec3 q=c.rgb*c.rgb;c.rgb=q/max(1.-q,1e-3);}
  return c;
}`;

const ssaoFragment=`${header}
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform vec4 uProjection;
uniform float uFrame,uRadius,uStrength;
float linearDepth(float d){
  float z=d*2.-1.;
  return 2.*uProjection.z*uProjection.w/(uProjection.w+uProjection.z-z*(uProjection.w-uProjection.z));
}
vec3 viewPosition(vec2 t){
  float z=linearDepth(textureLod(uDepth,t,0.).r);
  return vec3((t*2.-1.)*uProjection.xy*z,-z);
}
void main(){
  float raw=textureLod(uDepth,uv,0.).r;
  if(raw>=.99999){frag=vec4(1.);return;}
  vec3 p=viewPosition(uv);
  vec3 px=viewPosition(uv+vec2(uTexel.x,0.)),nx=viewPosition(uv-vec2(uTexel.x,0.));
  vec3 py=viewPosition(uv+vec2(0.,uTexel.y)),ny=viewPosition(uv-vec2(0.,uTexel.y));
  vec3 dx=abs(px.z-p.z)<abs(nx.z-p.z)?px-p:p-nx;
  vec3 dy=abs(py.z-p.z)<abs(ny.z-p.z)?py-p:p-ny;
  vec3 crossed=cross(dx,dy);
  if(dot(crossed,crossed)<1e-12){frag=vec4(1.);return;}
  vec3 n=normalize(crossed);
  float depth=-p.z;
  float radius=uRadius*(1.+depth*.012);
  vec2 extent=radius/(2.*depth*uProjection.xy);
  extent=min(extent,vec2(.12));
  float rotation=(ign(gl_FragCoord.xy)+uFrame*.618034)*6.2831853;
  float occlusion=0.;
  const int N=10;
  for(int i=0;i<N;i++){
    float r=sqrt((float(i)+.5)/float(N));
    float a=rotation+float(i)*2.3999632;
    vec2 offset=vec2(cos(a),sin(a))*r*extent;
    vec3 q=viewPosition(uv+offset);
    vec3 w=q-p;
    float d2=dot(w,w);
    float range=1.-smoothstep(radius*radius*.6,radius*radius*1.6,d2);
    occlusion+=max(0.,dot(w,n)/sqrt(d2+1e-4)-.06)*range;
  }
  float ao=1.-occlusion/float(N)*uStrength;
  frag=vec4(saturate(ao),0.,0.,1.);
}`;

const aoBlurFragment=`${header}
uniform sampler2D uAO,uDepth;
uniform vec2 uTexel;
uniform vec4 uProjection;
float linearDepth(float d){
  float z=d*2.-1.;
  return 2.*uProjection.z*uProjection.w/(uProjection.w+uProjection.z-z*(uProjection.w-uProjection.z));
}
void main(){
  float center=linearDepth(textureLod(uDepth,uv,0.).r);
  float sum=0.,weight=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 t=uv+vec2(x,y)*uTexel*1.5;
    float d=linearDepth(textureLod(uDepth,t,0.).r);
    float w=exp(-abs(d-center)/(center*.04+.05));
    sum+=textureLod(uAO,t,0.).r*w;weight+=w;
  }
  frag=vec4(sum/weight,0.,0.,1.);
}`;

const resolveFragment=`${header}
${decode}
uniform sampler2D uColor,uDepth,uHistory,uAO;
uniform mat4 uReproject;
uniform vec2 uTexel;
uniform float uReset,uUseAO,uUseHistory;
vec3 toYCoCg(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),dot(c,vec3(.5,0.,-.5)),dot(c,vec3(-.25,.5,-.25)));}
vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 tonemapWeight(vec3 c){return c/(1.+luminance(c));}
vec3 untonemap(vec3 c){return c/max(1.-luminance(c),1e-4);}
vec3 history(vec2 t){
  vec2 size=1./uTexel,pos=t*size,c=floor(pos-.5)+.5,f=pos-c;
  vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f);
  vec2 w12=w1+w2,t0=(c-1.)*uTexel,t3=(c+2.)*uTexel,t12=(c+w2/w12)*uTexel;
  vec3 r=textureLod(uHistory,vec2(t12.x,t0.y),0.).rgb*(w12.x*w0.y)+
    textureLod(uHistory,vec2(t0.x,t12.y),0.).rgb*(w0.x*w12.y)+
    textureLod(uHistory,t12,0.).rgb*(w12.x*w12.y)+
    textureLod(uHistory,vec2(t3.x,t12.y),0.).rgb*(w3.x*w12.y)+
    textureLod(uHistory,vec2(t12.x,t3.y),0.).rgb*(w12.x*w3.y);
  float total=w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y;
  return max(r/total,0.);
}
vec3 occluded(vec4 s,float ao){return s.rgb*(1.-abs(s.a)*(1.-ao));}
void main(){
  float ao=uUseAO>.5?textureLod(uAO,uv,0.).r:1.;
  vec4 scene=sceneSample(uColor,uv);
  vec3 current=occluded(scene,ao);
  if(any(isnan(current))||any(isinf(current)))current=vec3(0.);
  if(uUseHistory<.5){frag=vec4(uEncoded>.5?sqrt(current/(1.+current)):current,1.);return;}
  vec3 m1=vec3(0.),m2=vec3(0.),lo=vec3(1e9),hi=vec3(-1e9);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 c=x==0&&y==0?current:occluded(sceneSample(uColor,uv+vec2(x,y)*uTexel),ao);
    c=toYCoCg(tonemapWeight(c));
    m1+=c;m2+=c*c;lo=min(lo,c);hi=max(hi,c);
  }
  m1/=9.;
  vec3 sigma=sqrt(max(m2/9.-m1*m1,0.));
  float depth=textureLod(uDepth,uv,0.).r;
  vec4 previous=uReproject*vec4(uv*2.-1.,depth*2.-1.,1.);
  vec2 back=previous.xy/previous.w*.5+.5;
  bool dynamic=scene.a<0.;
  float gamma=dynamic?.75:1.25;
  vec3 boxLo=max(lo,m1-sigma*gamma),boxHi=min(hi,m1+sigma*gamma);
  vec3 past=toYCoCg(tonemapWeight(history(back)));
  vec3 center=(boxHi+boxLo)*.5,halfSize=max((boxHi-boxLo)*.5,vec3(1e-4));
  vec3 offset=past-center,unit=abs(offset/halfSize);
  float outside=max(unit.x,max(unit.y,unit.z));
  if(outside>1.)past=center+offset/outside;
  vec3 now=toYCoCg(tonemapWeight(current));
  vec2 motion=(back-uv)/uTexel;
  float blend=mix(.085,.22,saturate(length(motion)/18.));
  if(dynamic)blend=max(blend,.32);
  if(uReset>.5||any(lessThan(back,vec2(0.)))||any(greaterThan(back,vec2(1.))))blend=1.;
  vec3 result=untonemap(fromYCoCg(mix(past,now,blend)));
  if(any(isnan(result))||any(isinf(result)))result=any(isnan(current))||any(isinf(current))?vec3(0.):current;
  frag=vec4(max(result,0.),1.);
}`;

const downsampleFragment=`${header}
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uPrefilter;
vec3 tap(vec2 o){return textureLod(uSource,uv+o*uTexel,0.).rgb;}
vec3 karis(vec3 a,vec3 b,vec3 c,vec3 d){
  float wa=1./(1.+luminance(a)),wb=1./(1.+luminance(b)),wc=1./(1.+luminance(c)),wd=1./(1.+luminance(d));
  return (a*wa+b*wb+c*wc+d*wd)/(wa+wb+wc+wd);
}
void main(){
  vec3 a=tap(vec2(-2,2)),b=tap(vec2(0,2)),c=tap(vec2(2,2));
  vec3 d=tap(vec2(-2,0)),e=tap(vec2(0,0)),f=tap(vec2(2,0));
  vec3 g=tap(vec2(-2,-2)),h=tap(vec2(0,-2)),i=tap(vec2(2,-2));
  vec3 j=tap(vec2(-1,1)),k=tap(vec2(1,1)),l=tap(vec2(-1,-1)),m=tap(vec2(1,-1));
  vec3 color;
  if(uPrefilter>.5){
    color=karis(j,k,l,m)*.5+karis(a,b,d,e)*.125+karis(b,c,e,f)*.125+karis(d,e,g,h)*.125+karis(e,f,h,i)*.125;
    float bright=luminance(color);
    float knee=.6,threshold=1.05;
    float soft=clamp(bright-threshold+knee,0.,2.*knee);
    soft=soft*soft/(4.*knee+1e-4);
    color*=max(soft,bright-threshold)/max(bright,1e-4);
    color=min(color,vec3(64.));
  }else{
    color=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
  }
  frag=vec4(color,1.);
}`;

const upsampleFragment=`${header}
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uWeight;
void main(){
  vec3 c=textureLod(uSource,uv,0.).rgb*4.;
  c+=(textureLod(uSource,uv+vec2(-1,0)*uTexel,0.).rgb+textureLod(uSource,uv+vec2(1,0)*uTexel,0.).rgb+
    textureLod(uSource,uv+vec2(0,-1)*uTexel,0.).rgb+textureLod(uSource,uv+vec2(0,1)*uTexel,0.).rgb)*2.;
  c+=textureLod(uSource,uv+vec2(-1,-1)*uTexel,0.).rgb+textureLod(uSource,uv+vec2(1,-1)*uTexel,0.).rgb+
    textureLod(uSource,uv+vec2(-1,1)*uTexel,0.).rgb+textureLod(uSource,uv+vec2(1,1)*uTexel,0.).rgb;
  frag=vec4(c/16.*uWeight,1.);
}`;

const finalFragment=`${header}
${decode}
${glslTonemap}
uniform sampler2D uColor,uBloom,uDepth;
uniform vec2 uTexel;
uniform float uBloomStrength,uTime,uSharpen,uFXAA,uVignette,uHasBloom;
uniform vec4 uSunScreen;
uniform vec3 uSunTint;
vec3 sceneColor(vec2 t){return sceneSample(uColor,t).rgb;}
float lumaOf(vec3 c){return sqrt(luminance(c/(1.+c)));}
vec3 fxaa(vec2 t){
  vec3 rgbM=sceneColor(t);
  vec3 rgbNW=sceneColor(t+vec2(-1,-1)*uTexel),rgbNE=sceneColor(t+vec2(1,-1)*uTexel);
  vec3 rgbSW=sceneColor(t+vec2(-1,1)*uTexel),rgbSE=sceneColor(t+vec2(1,1)*uTexel);
  float lM=lumaOf(rgbM),lNW=lumaOf(rgbNW),lNE=lumaOf(rgbNE),lSW=lumaOf(rgbSW),lSE=lumaOf(rgbSE);
  float lo=min(lM,min(min(lNW,lNE),min(lSW,lSE))),hi=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));
  float reduce=max((lNW+lNE+lSW+lSE)*.03125,.0078125);
  float scale=1./(min(abs(dir.x),abs(dir.y))+reduce);
  dir=clamp(dir*scale,-8.,8.)*uTexel;
  vec3 a=.5*(sceneColor(t+dir*(1./3.-.5))+sceneColor(t+dir*(2./3.-.5)));
  vec3 b=a*.5+.25*(sceneColor(t-dir*.5)+sceneColor(t+dir*.5));
  float lb=lumaOf(b);
  return lb<lo||lb>hi?a:b;
}
void main(){
  vec3 color;
  if(uFXAA>.5)color=fxaa(uv);
  else{
    color=sceneColor(uv);
    if(uSharpen>0.){
      vec3 n=sceneColor(uv+vec2(0.,uTexel.y)),s=sceneColor(uv-vec2(0.,uTexel.y));
      vec3 e=sceneColor(uv+vec2(uTexel.x,0.)),w=sceneColor(uv-vec2(uTexel.x,0.));
      vec3 lo=min(color,min(min(n,s),min(e,w))),hi=max(color,max(max(n,s),max(e,w)));
      vec3 detail=color-(n+s+e+w)*.25;
      float amount=uSharpen*saturate(1.-luminance(hi-lo)/(luminance(hi)+.05));
      color=clamp(color+detail*amount*2.,lo,hi);
    }
  }
  if(uHasBloom>.5)color+=textureLod(uBloom,uv,0.).rgb*uBloomStrength;
  float sunSeen=0.;
  if(uSunScreen.w>0.){
    for(int i=0;i<5;i++){
      vec2 o=vec2(i==1?1.:i==2?-1.:0.,i==3?1.:i==4?-1.:0.)*.004;
      vec2 t=uSunScreen.xy+o;
      bool inside=t.x>0.&&t.x<1.&&t.y>0.&&t.y<1.;
      float bright=inside?luminance(sceneColor(t)):0.;
      sunSeen+=inside&&textureLod(uDepth,t,0.).r>=1.?.2*smoothstep(25.,140.,bright):0.;
    }
  }
  if(uSunScreen.w>0.&&sunSeen>.01){
    // Sun shafts: march toward the sun and count open sky, so buildings and trees cut rays.
    vec2 toSun=uSunScreen.xy-uv;
    float reach=length(toSun*vec2(uTexel.y/uTexel.x,1.));
    if(reach<1.1){
      const int STEPS=20;
      vec2 stepUV=toSun/float(STEPS);
      vec2 t=uv+stepUV*ign(gl_FragCoord.xy);
      float open=0.,weight=1.,total=0.;
      for(int i=0;i<STEPS;i++){
        float sky=textureLod(uDepth,clamp(t,vec2(0.),vec2(1.)),0.).r>=1.?1.:0.;
        open+=sky*weight;total+=weight;weight*=.94;t+=stepUV;
      }
      float shafts=open/total*pow(1.-smoothstep(.0,1.1,reach),2.);
      color+=uSunTint*shafts*shafts*.2*uSunScreen.w*sunSeen;
    }
    vec2 aspect=vec2(uTexel.y/uTexel.x,1.);
    float visible=sunSeen;
    if(visible>0.){
      vec2 d=(uv-uSunScreen.xy)*aspect;
      float r=length(d);
      float glare=exp(-r*9.)*.22+exp(-r*38.)*.5;
      float streak=exp(-abs(d.y)*260.)*exp(-abs(d.x)*4.)*.18;
      vec2 axis=(vec2(.5)-uSunScreen.xy)*aspect;
      float ghosts=0.;
      for(int i=1;i<=3;i++){
        vec2 g=uSunScreen.xy*aspect+axis*(float(i)*.55+.15);
        float size=.025+float(i)*.018;
        ghosts+=smoothstep(size,size*.6,length(uv*aspect-g))*.025/float(i);
      }
      color+=uSunTint*(glare+streak+ghosts)*visible*uSunScreen.w;
    }
  }
  color=acesFitted(color);
  color=grade(color);
  vec2 centered=uv-.5;
  color*=1.-uVignette*smoothstep(.25,1.05,dot(centered,centered)*2.2);
  color=linearToSrgb(color);
  float grain=hash(gl_FragCoord.xy+fract(uTime*13.17)*917.)+hash(gl_FragCoord.xy*1.37+fract(uTime*7.31)*411.)-1.;
  color+=grain*(1./255.+.012*(1.-luminance(color)));
  frag=vec4(color,1.);
}`;

function compile(gl,vs,fs,uniforms){
  const make=(type,code)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)+'\n'+code.split('\n').map((l,i)=>(i+1)+': '+l).join('\n'));
    return shader;
  };
  const program=gl.createProgram(),a=make(gl.VERTEX_SHADER,vs),b=make(gl.FRAGMENT_SHADER,fs);
  gl.attachShader(program,a);gl.attachShader(program,b);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.deleteShader(a);gl.deleteShader(b);
  return {program,u:Object.fromEntries(uniforms.map(n=>[n,gl.getUniformLocation(program,'u'+n)]))};
}

export function createPost(gl,{floatColor}){
  const programs={
    ssao:compile(gl,fullscreen,ssaoFragment,['Depth','Texel','Projection','Frame','Radius','Strength']),
    aoBlur:compile(gl,fullscreen,aoBlurFragment,['AO','Depth','Texel','Projection']),
    resolve:compile(gl,fullscreen,resolveFragment,['Color','Depth','History','AO','Reproject','Texel','Reset','UseAO','UseHistory','Encoded']),
    down:compile(gl,fullscreen,downsampleFragment,['Source','Texel','Prefilter']),
    up:compile(gl,fullscreen,upsampleFragment,['Source','Texel','Weight']),
    final:compile(gl,fullscreen,finalFragment,['Color','Bloom','Depth','Texel','BloomStrength','Time','Sharpen','FXAA',
      'Vignette','HasBloom','SunScreen','SunTint','Encoded'])
  };
  const vao=gl.createVertexArray();
  const hdr=floatColor?{internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT}:{internal:gl.RGBA8,format:gl.RGBA,type:gl.UNSIGNED_BYTE};
  const bloomFormat=floatColor?{internal:gl.R11F_G11F_B10F,format:gl.RGB,type:gl.HALF_FLOAT}:hdr;
  let size=[0,0],targets=null,historyIndex=0,historyValid=false;

  function texture(w,h,{internal,format,type},filter=gl.LINEAR){
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texStorage2D(gl.TEXTURE_2D,1,internal,w,h);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  function framebuffer(color,depth){
    const f=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,f);
    if(color)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
    if(depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
    const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    if(!ok)throw Error('Incomplete framebuffer');
    return f;
  }
  function release(){
    if(!targets)return;
    for(const t of targets.textures)gl.deleteTexture(t);
    for(const f of targets.framebuffers)gl.deleteFramebuffer(f);
    targets=null;
  }
  function resize(w,h){
    if(targets&&size[0]===w&&size[1]===h)return;
    release();
    size=[w,h];
    const textures=[],framebuffers=[],keep=t=>(textures.push(t),t),fb=(...a)=>{const f=framebuffer(...a);framebuffers.push(f);return f;};
    const color=keep(texture(w,h,hdr,gl.NEAREST));
    const depth=keep(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D,depth);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,w,h);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D,k,v);
    const scene=fb(color,depth);
    const half=[Math.max(1,w>>1),Math.max(1,h>>1)];
    const aoFormat={internal:gl.R8,format:gl.RED,type:gl.UNSIGNED_BYTE};
    const ao=[keep(texture(...half,aoFormat)),keep(texture(...half,aoFormat))];
    const aoTargets=ao.map(t=>fb(t));
    const historyFormat=floatColor?{internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT}:hdr;
    const history=[keep(texture(w,h,historyFormat)),keep(texture(w,h,historyFormat))];
    const historyTargets=history.map(t=>fb(t));
    const bloom=[];
    let bw=w,bh=h;
    for(let i=0;i<6;i++){
      bw=Math.max(1,bw>>1);bh=Math.max(1,bh>>1);
      if(Math.min(bw,bh)<4)break;
      const t=keep(texture(bw,bh,bloomFormat));
      bloom.push({texture:t,framebuffer:fb(t),size:[bw,bh]});
    }
    targets={color,depth,scene,ao,aoTargets,history,historyTargets,bloom,half,textures,framebuffers};
    historyValid=false;
  }
  function pass(program,target,w,h){
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.viewport(0,0,w,h);
    gl.useProgram(program.program);
  }
  function bind(unit,texture){
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    return unit;
  }
  function draw(){gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,3);}

  // Runs every screen pass. options: ssao, taa, bloom, reproject (Float32Array), projection [tx,ty,near,far],
  // frame, time, sun {x,y,visible,tint}, reset.
  function run(o){
    const {color,depth,ao,aoTargets,history,historyTargets,bloom,half}=targets;
    const [w,h]=size;
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
    for(let unit=0;unit<4;unit++){gl.activeTexture(gl.TEXTURE0+unit);gl.bindSampler(unit,null);}
    let aoTexture=null;
    if(o.ssao){
      const p=programs.ssao;
      pass(p,aoTargets[0],...half);
      gl.uniform1i(p.u.Depth,bind(0,depth));
      gl.uniform2f(p.u.Texel,1/half[0],1/half[1]);
      gl.uniform4fv(p.u.Projection,o.projection);
      gl.uniform1f(p.u.Frame,o.taa?o.frame%64:0);
      gl.uniform1f(p.u.Radius,o.aoRadius??1.1);
      gl.uniform1f(p.u.Strength,o.aoStrength??1.35);
      draw();
      const b=programs.aoBlur;
      pass(b,aoTargets[1],...half);
      gl.uniform1i(b.u.AO,bind(0,ao[0]));
      gl.uniform1i(b.u.Depth,bind(1,depth));
      gl.uniform2f(b.u.Texel,1/half[0],1/half[1]);
      gl.uniform4fv(b.u.Projection,o.projection);
      draw();
      aoTexture=ao[1];
    }
    // Resolve: occlusion is applied to the ambient share stored in alpha, then history is blended.
    const useHistory=o.taa&&historyValid&&!o.reset;
    const write=historyIndex^1;
    const r=programs.resolve;
    pass(r,historyTargets[write],w,h);
    gl.uniform1i(r.u.Color,bind(0,color));
    gl.uniform1i(r.u.Depth,bind(1,depth));
    gl.uniform1i(r.u.History,bind(2,history[historyIndex]));
    gl.uniform1i(r.u.AO,bind(3,aoTexture??ao[0]));
    gl.uniformMatrix4fv(r.u.Reproject,false,o.reproject);
    gl.uniform2f(r.u.Texel,1/w,1/h);
    gl.uniform1f(r.u.Reset,o.reset?1:0);
    gl.uniform1f(r.u.UseAO,aoTexture?1:0);
    gl.uniform1f(r.u.UseHistory,useHistory?1:0);
    gl.uniform1f(r.u.Encoded,floatColor?0:1);
    draw();
    historyIndex=write;historyValid=o.taa;
    const resolved=history[historyIndex];
    if(o.bloom&&bloom.length){
      const d=programs.down;
      let source=resolved,sw=w,sh=h;
      for(const [i,level] of bloom.entries()){
        pass(d,level.framebuffer,...level.size);
        gl.uniform1i(d.u.Source,bind(0,source));
        gl.uniform2f(d.u.Texel,1/sw,1/sh);
        gl.uniform1f(d.u.Prefilter,i===0?1:0);
        draw();
        source=level.texture;[sw,sh]=level.size;
      }
      const u=programs.up;
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
      for(let i=bloom.length-1;i>0;i--){
        const target=bloom[i-1];
        pass(u,target.framebuffer,...target.size);
        gl.uniform1i(u.u.Source,bind(0,bloom[i].texture));
        gl.uniform2f(u.u.Texel,1/bloom[i].size[0],1/bloom[i].size[1]);
        gl.uniform1f(u.u.Weight,1);
        draw();
      }
      gl.disable(gl.BLEND);
    }
    const f=programs.final;
    pass(f,null,o.outputWidth,o.outputHeight);
    gl.uniform1i(f.u.Color,bind(0,resolved));
    gl.uniform1i(f.u.Bloom,bind(1,bloom[0]?.texture??resolved));
    gl.uniform1i(f.u.Depth,bind(2,depth));
    gl.uniform2f(f.u.Texel,1/w,1/h);
    gl.uniform1f(f.u.BloomStrength,o.bloomStrength??.11);
    gl.uniform1f(f.u.HasBloom,o.bloom&&bloom.length?1:0);
    gl.uniform1f(f.u.Time,o.time);
    gl.uniform1f(f.u.Sharpen,o.taa?.32:0);
    gl.uniform1f(f.u.FXAA,o.taa?0:1);
    gl.uniform1f(f.u.Vignette,o.vignette??.28);
    gl.uniform4fv(f.u.SunScreen,o.sun??[0,0,0,0]);
    gl.uniform3fv(f.u.SunTint,o.sunTint??[1,1,1]);
    gl.uniform1f(f.u.Encoded,floatColor?0:1);
    draw();
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }
  return {
    resize,run,
    get scene(){return targets.scene;},
    get size(){return size;},
    invalidate(){historyValid=false;},
    dispose:release
  };
}
