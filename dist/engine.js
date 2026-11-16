import {roofFaces,chamferFaces,taperFaces,windowFaces,paneFaces} from './models.js';
import {distanceToBounds,frustumPlanes,inFrustum,glassOrder} from './mesh-batches.js';
import {SIGNAL_GREEN} from './street-lights.js';
import {MATERIAL_SIZE,surfaceProfiles} from './architecture-materials.js';
import {actorKinds} from './moving-models.js';
import {SKY_LUT_SIZE,skyLutFragment,skyModel} from './gfx-common.js';
import {ADAPT_BAND,ADAPT_BAND_UNDERGROUND,createPost} from './gfx-post.js';
import {KIND_IDS,depthFragment,skyFragment,skyVertex,worldFragment,worldVertex} from './world-shader.js';
import {createActorRenderer} from './actor-renderer.js';
import {rad,normalize as unit,vectorCross as cross} from './vector.js';
import {compileProgram,whenCompiled} from './gl-program.js';
import {PHOTO_TABLE_ROWS,PHOTO_TABLE_WIDTH} from './generated-textures.js';
export {rad};
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export function view(eye,to){
  const z=unit(eye.map((v,i)=>v-to[i])),x=unit(cross([0,1,0],z)),y=cross(z,x);
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
function product(a,b){
  return new Float32Array(b.map((_,i)=>a[i%4]*b[i-i%4]+a[i%4+4]*b[i-i%4+1]+a[i%4+8]*b[i-i%4+2]+a[i%4+12]*b[i-i%4+3]));
}
const NEAR=.12,FAR=1220,FOV=61*rad;
function perspective(ratio,fov=FOV){
  const k=1/Math.tan(fov/2);
  return [k/ratio,0,0,0,0,k,0,0,0,0,(NEAR+FAR)/(NEAR-FAR),-1,0,0,2*NEAR*FAR/(NEAR-FAR),0];
}
export const cameraProjection=(eye,to,ratio,fov=FOV)=>product(perspective(ratio,fov),view(eye,to));
export function shadowProjection(sun,anchor,size,range=146){
  const texel=2*range/size;
  const lightView=view(sun.map((n,i)=>anchor[i]+n*410),anchor);
  lightView[12]=Math.round(lightView[12]/texel)*texel;
  lightView[13]=Math.round(lightView[13]/texel)*texel;
  return product([1/range,0,0,0,0,1/range,0,0,0,0,-2/800,0,0,0,-1,1],lightView);
}
function invert(m){
  const a=m,out=new Float32Array(16);
  const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5];
  const b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12];
  const b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!det)return out;
  det=1/det;
  out[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det;out[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*det;
  out[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det;out[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*det;
  out[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*det;out[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;
  out[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*det;out[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;
  out[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det;out[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*det;
  out[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det;out[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*det;
  out[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*det;out[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;
  out[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*det;out[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;
  return out;
}
const clampFov=degrees=>Math.min(80,Math.max(50,Number(degrees)||61));
const halton=(index,base)=>{let f=1,r=0;while(index>0){f/=base;r+=f*(index%base);index=Math.floor(index/base);}return r;};
const jitterSequence=Array.from({length:8},(_,i)=>[halton(i+1,2)-.5,halton(i+1,3)-.5]);

// Indexed geometry: shared vertices let the vertex cache skip repeated work.
function indexed(mesh){
  const map=new Map(),vertices=[],indices=[];
  for(let i=0;i<mesh.length;i+=6){
    const key=Array.from(mesh.slice(i,i+6),v=>Math.round(v*1e5)).join(',');
    let index=map.get(key);
    if(index===undefined){index=vertices.length/6;map.set(key,index);vertices.push(...mesh.slice(i,i+6));}
    indices.push(index);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
function cube(){
  const mesh=[];
  const faces=[[[0,0,1],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],[[0,0,-1],[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],[[1,0,0],[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],[[-1,0,0],[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],[[0,1,0],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],[[0,-1,0],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]];
  for(const [n,...p] of faces)for(const i of [0,1,2,0,2,3])mesh.push(...p[i],...n);
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
function cylinder(top,segments){
  const mesh=[],slope=(1-top)*.5;
  for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const p=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],q=[Math.cos(b)*.5,-.5,Math.sin(b)*.5];
    const r=[q[0]*top,.5,q[2]*top],s=[p[0]*top,.5,p[2]*top];
    const na=unit([Math.cos(a),slope,Math.sin(a)]),nb=unit([Math.cos(b),slope,Math.sin(b)]);
    if(top){
      for(const [v,n] of [[p,na],[s,na],[r,nb],[p,na],[r,nb],[q,nb]])mesh.push(...v,...n);
    }else{
      const nm=unit([Math.cos((a+b)/2),slope,Math.sin((a+b)/2)]);
      for(const [v,n] of [[p,na],[[0,.5,0],nm],[q,nb]])mesh.push(...v,...n);
    }
    for(const v of [[0,-.5,0],p,q])mesh.push(...v,0,-1,0);
    if(top)for(const v of [[0,.5,0],r,s])mesh.push(...v,0,1,0);
  }
  return mesh;
}
function sphere(rings=10,columns=16){
  const mesh=[],p=(a,b)=>[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)];
  for(let i=0;i<rings;i++)for(let j=0;j<columns;j++){
    const a=(i/rings-.5)*Math.PI,b=((i+1)/rings-.5)*Math.PI,c=j*2*Math.PI/columns,d=(j+1)*2*Math.PI/columns;
    for(const v of [p(a,c),p(b,c),p(b,d),p(a,c),p(b,d),p(a,d)])mesh.push(...v.map(n=>n*.5),...v);
  }
  return mesh;
}
export {compileProgram};
const fullscreenVertex=`#version 300 es
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;
function toHalf(value){
  const f=new Float32Array([value]),i=new Uint32Array(f.buffer)[0];
  const sign=(i>>>16)&0x8000,exponent=((i>>>23)&0xff)-112,mantissa=i&0x7fffff;
  if(exponent<=0)return sign;
  if(exponent>=31)return sign|0x7c00;
  return sign|(exponent<<10)|(mantissa>>>13);
}
const undergroundModel=light=>{
  const warm=[1.0,.97,.9];
  const level=.16;
  return {underground:true,sun:light.sun,sunColor:[0,0,0],groundRadiance:warm.map(v=>v*.05),horizon:warm.map(v=>v*.06),
    ambientUp:warm.map(v=>v*level),ambientDown:warm.map(v=>v*level*.55),ambientSun:warm.map(v=>v*level*.8),
    ambientAnti:warm.map(v=>v*level*.8),multiScatter:[0,0,0],mieScatter:[0,0,0],mieAbsorb:0,groundAlbedo:[0,0,0]};
};

// With wait:false the shaders compile in the background; await renderer.ready before rendering.
export function createRenderer(canvas,{wait=true}={}){
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
  if(!gl)throw Error('WebGL 2 unavailable');
  // Lets drivers build the programs on worker threads and report progress without blocking.
  gl.getExtension('KHR_parallel_shader_compile');
  let floatColor=!!gl.getExtension('EXT_color_buffer_float');
  const anisotropic=gl.getExtension('EXT_texture_filter_anisotropic');
  const mobile=matchMedia('(pointer:coarse)').matches;
  const main=compileProgram(gl,worldVertex,worldFragment);
  const depth=compileProgram(gl,worldVertex,depthFragment);
  const skies=compileProgram(gl,skyVertex,skyFragment);
  const skyLut=compileProgram(gl,fullscreenVertex,skyLutFragment);
  let post=createPost(gl,{floatColor,compileProgram});
  // Detailed actors are optional: without them the primitive figures are drawn instead.
  const noActors={ready:false,programs:[],update(){},draw(){},drawShadows(){}};
  let actors;
  try{actors=createActorRenderer(gl,{compileProgram,mobile});}
  catch(error){
    console.info('Detailed actors unavailable',error.message);
    actors=noActors;
  }
  // Every program has been handed to the driver by now; statuses are read only after this point.
  const corePrograms=[main,depth,skies,skyLut,...post.programs];
  function checkActors(){
    try{for(const program of actors.programs??[])program.resolve();}
    catch(error){
      console.info('Detailed actors unavailable',error.message);
      actors.dispose?.();actors=noActors;
    }
  }
  const geometries={
    roof:faceMesh(roofFaces),chamfer:faceMesh(chamferFaces),taper:faceMesh(taperFaces),
    window:faceMesh(windowFaces),pane:faceMesh(paneFaces),tri:[0,0,0,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0],
    box:cube(),tube:cylinder(1,18),cone:cylinder(0,18),pyramid:cylinder(0,4),ball:sphere(10,16),effect:faceMesh(paneFaces)
  };
  const geometry=Object.fromEntries(Object.entries(geometries).map(([kind,data])=>{
    const {vertices,indices}=indexed(data);
    const buffer=gl.createBuffer(),elements=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    return [kind,{buffer,elements,count:indices.length}];
  }));
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
  const maxResidentBytes=(mobile?22:42)*1024*1024;
  const residents=new Map(),emptyVao=gl.createVertexArray();
  const people=Object.fromEntries(actorKinds.map(kind=>{
    const buffer=gl.createBuffer();
    return [kind,{buffer,mesh:instanceMesh(kind,buffer,0,0),scratch:new Float32Array(0)}];
  }));
  const paneBuffer=gl.createBuffer(),paneMesh=instanceMesh('pane',paneBuffer,0,0);
  let surfaceTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfaceTexture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,1,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,190,128]));
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  // Sky radiance by direction, re-rendered whenever the sun or the air changes.
  const skyTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D,skyTexture);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA16F,...SKY_LUT_SIZE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  // Made on the first sky render: a completeness check here would wait for the shader compiles.
  let skyFramebuffer=null,skyTarget=floatColor?undefined:null;
  function skyRenderTarget(){
    if(skyTarget!==undefined)return skyTarget;
    skyFramebuffer=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,skyFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,skyTexture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(skyFramebuffer);skyFramebuffer=null;}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    skyTarget=skyFramebuffer;
    return skyTarget;
  }
  // Shadow atlas: two cascades side by side, sampled with hardware comparison and as raw depth.
  const compareSampler=gl.createSampler(),rawSampler=gl.createSampler();
  for(const [s,mode,filter] of [[compareSampler,gl.COMPARE_REF_TO_TEXTURE,gl.LINEAR],[rawSampler,gl.NONE,gl.NEAREST]]){
    gl.samplerParameteri(s,gl.TEXTURE_COMPARE_MODE,mode);
    gl.samplerParameteri(s,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    gl.samplerParameteri(s,gl.TEXTURE_MIN_FILTER,filter);
    gl.samplerParameteri(s,gl.TEXTURE_MAG_FILTER,filter);
    gl.samplerParameteri(s,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(s,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  const placeholderShadow=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,placeholderShadow);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT16,1,1);
  gl.activeTexture(gl.TEXTURE0);
  let surfacesReady=false,materialUpload=null;
  // Image-generated textures: a layer array and a small float table (see generated-textures.js).
  // 1x1 placeholders keep the samplers valid until the textures arrive.
  let photoTexture=gl.createTexture(),photoUpload=null,photoReady=false;
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,photoTexture);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,1,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
  const photoTable=gl.createTexture();
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D,photoTable);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,PHOTO_TABLE_WIDTH,PHOTO_TABLE_ROWS);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  gl.activeTexture(gl.TEXTURE0);
  let paneData=new Float32Array(0);
  let scene=[],sceneSet=new Set(),residentBytes=0,renderedFrames=0,detailRadius=227,viewRadius=435;
  let quality='auto',autoScale=1,previousWalkers;
  let flash=new Float32Array(4),flashColor=[1,.6,.3];
  let shadowBuffer=null,shadowUnsupported=false,shadowDirty=true;
  const cascades=[{range:38,snap:4,key:'',last:-Infinity,matrix:null,planes:null},{range:205,snap:40,key:'',last:-Infinity,matrix:null,planes:null}];
  let skyKey='',model=null,modelTime=-Infinity,lutDirty=true;
  let exposure=8.2,frameIndex=0,previousVP=null,previousEye=null,previousSize='',previousTime=null;
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
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,shape.elements);
    gl.bindVertexArray(null);
    return {vao,elements:shape.count,count,kind:KIND_IDS[kind]};
  }

  function createShadowBuffer(){
    const size=mobile?1024:2048,framebuffer=gl.createFramebuffer(),texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT16,size*2,size);
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

  function continueMaterialUpload(){
    const job=materialUpload,layer=MATERIAL_SIZE*MATERIAL_SIZE*4,count=Math.min(4,surfaceProfiles.length-job.next);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,job.texture);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,job.next,MATERIAL_SIZE,MATERIAL_SIZE,count,gl.RGBA,gl.UNSIGNED_BYTE,
      job.bytes.subarray(job.next*layer,(job.next+count)*layer));
    job.next+=count;
    if(job.next>=surfaceProfiles.length){
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
      if(anisotropic)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(mobile?4:8,gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.deleteTexture(surfaceTexture);
      surfaceTexture=job.texture;materialUpload=null;surfacesReady=true;
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  // A few photo layers per frame, then mipmaps; the table switches them on in one step.
  function continuePhotoUpload(){
    const job=photoUpload;
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,job.texture);
    // About 2.4 MB per frame: four 384 px layers, six at 320 px or twelve at 224 px.
    const perFrame=Math.max(1,Math.round(2.4e6/(job.tile*job.tile*4)));
    for(let n=0;n<perFrame&&job.next<job.layers.length;n++,job.next++){
      const image=job.layers[job.next];
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,job.next,job.tile,job.tile,1,gl.RGBA,gl.UNSIGNED_BYTE,image);
      image.close?.();job.layers[job.next]=null;
    }
    if(job.next>=job.layers.length){
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
      if(anisotropic)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(mobile?4:8,gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D,photoTable);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,PHOTO_TABLE_WIDTH,PHOTO_TABLE_ROWS,gl.RGBA,gl.FLOAT,job.table);
      gl.deleteTexture(photoTexture);
      photoTexture=job.texture;photoUpload=null;photoReady=true;
    }
    gl.activeTexture(gl.TEXTURE0);
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
    actors.update(walkers);
  }

  let boundKind=-1,kindLocation=null;
  function drawMesh(mesh){
    if(!mesh.count)return;
    if(mesh.kind!==boundKind){gl.uniform1i(kindLocation,mesh.kind);boundKind=mesh.kind;}
    gl.bindVertexArray(mesh.vao);
    gl.drawElementsInstanced(gl.TRIANGLES,mesh.elements,gl.UNSIGNED_SHORT,0,mesh.count);
  }
  function useWorldProgram(program){
    gl.useProgram(program.program);
    kindLocation=program.u.Kind;boundKind=-1;
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

  function updateSky(lighting,time){
    const underground=lighting.night>.1;
    const key=[...lighting.sun,lighting.haze,...(lighting.horizon??[]),underground?1:0].map(v=>Number(v).toFixed(3)).join(',');
    if(key===skyKey)return;
    if(underground){model=undergroundModel(lighting);skyKey=key;return;}
    if(model&&!model.underground&&time-modelTime<.22)return;
    model=skyModel(lighting);skyKey=key;modelTime=time;lutDirty=true;
  }
  function renderSkyTexture(){
    if(!lutDirty||model.underground)return;
    lutDirty=false;
    const [w,h]=SKY_LUT_SIZE;
    if(skyRenderTarget()){
      gl.bindFramebuffer(gl.FRAMEBUFFER,skyFramebuffer);
      gl.viewport(0,0,w,h);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
      gl.useProgram(skyLut.program);
      gl.uniform3fv(skyLut.u.Sun,model.sun);
      gl.uniform3fv(skyLut.u.MieScatter,model.mieScatter);
      gl.uniform1f(skyLut.u.MieAbsorb,model.mieAbsorb);
      gl.uniform3fv(skyLut.u.MultiScatter,model.multiScatter);
      gl.uniform3fv(skyLut.u.GroundAlbedo,model.groundAlbedo);
      gl.uniform2f(skyLut.u.Size,w,h);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      return;
    }
    // Without renderable float targets the table is filled on the CPU at a coarser resolution.
    const data=new Uint16Array(w*h*4),cw=64,ch=32,coarse=new Float32Array(cw*ch*3);
    const radiance=model.radiance??(()=>[0,0,0]);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const az=((x+.5)/cw-.5)*2*Math.PI,s=(y+.5)/ch-.5,el=Math.sign(s)*4*s*s*Math.PI*.5;
      const c=radiance([Math.cos(el)*Math.sin(az),Math.sin(el),-Math.cos(el)*Math.cos(az)]);
      coarse.set(c,(y*cw+x)*3);
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      // Bilinear between coarse texel centers, wrapping around in azimuth.
      const fx=(x+.5)*cw/w-.5,fy=Math.min(ch-1,Math.max(0,(y+.5)*ch/h-.5));
      const x0=Math.floor(fx),y0=Math.min(ch-2,Math.floor(fy)),u=fx-x0,v=fy-y0;
      const a=(x0%cw+cw)%cw,b=(a+1)%cw;
      for(let c=0;c<3;c++){
        const at=(i,j)=>coarse[(j*cw+i)*3+c];
        const top=at(a,y0)+(at(b,y0)-at(a,y0))*u,bottom=at(a,y0+1)+(at(b,y0+1)-at(a,y0+1))*u;
        data[(y*w+x)*4+c]=toHalf(top+(bottom-top)*v);
      }
      data[(y*w+x)*4+3]=toHalf(1);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D,skyTexture);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.HALF_FLOAT,data);
    gl.activeTexture(gl.TEXTURE0);
  }

  // Real skylight is whiter than single scattering suggests, and city streets also receive
  // warm light bounced from sunlit facades, so the ambient terms are partly neutralized.
  const neutral=(c,amount=.45,gain=1.55)=>{
    const l=c[0]*.2126+c[1]*.7152+c[2]*.0722;
    return c.map(v=>(l+(v-l)*(1-amount))*gain);
  };
  function sendLighting(u,lighting,time,shadows){
    const m=model;
    gl.uniform3fv(u.Sun,m.sun);
    gl.uniform3fv(u.SunColor,m.sunColor);
    const outdoor=!m.underground;
    gl.uniform3fv(u.AmbUp,outdoor?neutral(m.ambientUp,.6):m.ambientUp);
    gl.uniform3fv(u.AmbDown,outdoor?m.ambientDown.map(v=>v*1.4):m.ambientDown);
    gl.uniform3fv(u.AmbSun,outdoor?neutral(m.ambientSun,.35):m.ambientSun);
    gl.uniform3fv(u.AmbAnti,outdoor?neutral(m.ambientAnti,.35):m.ambientAnti);
    gl.uniform3fv(u.Bounce,outdoor?m.sunColor.map(v=>v*Math.max(m.sun[1],0)*.075):[0,0,0]);
    gl.uniform3fv(u.GroundRad,m.groundRadiance);
    gl.uniform1f(u.Night,lighting.night);
    gl.uniform1f(u.Underground,m.underground?1:0);
    gl.uniform1f(u.Time,time);
    gl.uniform1f(u.Haze,lighting.haze);
    gl.uniform1f(u.Quality,quality==='low'?0:1);
    gl.uniform1f(u.Frame,frameIndex%1024);
    gl.uniform1f(u.Shadow,shadows?1:0);
    gl.uniform1f(u.Dynamic,0);
    gl.uniform1f(u.Encode,floatColor?0:1);
    gl.uniform1f(u.Exposure,exposure);
    gl.uniform1f(u.ViewRadius,viewRadius);
    gl.uniform1f(u.Ocean,lighting.ocean);
    gl.uniform2fv(u.OceanBearing,lighting.oceanBearing??[-1,0]);
    gl.uniform2f(u.CloudOffset,time*7.5+1800,time*2.6-900);
    gl.uniform1f(u.CloudCover,lighting.clouds??.42);
    gl.uniform4fv(u.Flash,flash);
    if(u.PhotoMaps){gl.uniform1i(u.PhotoMaps,5);gl.uniform1i(u.PhotoTable,6);gl.uniform1f(u.PhotoReady,photoReady?1:0);}
    gl.uniform3fv(u.FlashColor,flashColor);
    if(u.ShadowVP0){
      gl.uniformMatrix4fv(u.ShadowVP0,false,cascades[0].matrix??identity);
      gl.uniformMatrix4fv(u.ShadowVP1,false,cascades[1].matrix??identity);
      const size=shadowBuffer?.size??2048;
      gl.uniform4f(u.ShadowRange,cascades[0].range,cascades[1].range,2*cascades[0].range/size,2*cascades[1].range/size);
      gl.uniform1i(u.ShadowMap,0);
      gl.uniform1i(u.ShadowDepth,2);
    }
    if(u.SkyLUT)gl.uniform1i(u.SkyLUT,3);
  }
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

  function renderShadows(eye,forward,time,movedActors){
    const {framebuffer,size}=shadowBuffer;
    let bound=false;
    for(const [index,cascade] of cascades.entries()){
      const ahead=index===0?cascade.range*.45:cascade.range*.3;
      const anchor=[Math.round((eye[0]+forward[0]*ahead)/cascade.snap)*cascade.snap,
        Math.round(eye[1]/(cascade.snap*.5))*cascade.snap*.5,Math.round((eye[2]+forward[2]*ahead)/cascade.snap)*cascade.snap];
      const key=model.sun.map(n=>Math.round(n*400)).join(',')+':'+anchor.join(',');
      const moved=key!==cascade.key;
      const due=moved||shadowDirty&&time-cascade.last>=(index?.12:.08)||movedActors&&time-cascade.last>=(index?.2:.06);
      if(!due)continue;
      if(moved){
        cascade.matrix=shadowProjection(model.sun,anchor,size,cascade.range);
        cascade.planes=frustumPlanes(cascade.matrix);
        cascade.key=key;
      }
      if(!bound){
        gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        useWorldProgram(depth);
        gl.uniform1f(depth.u.Time,time);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.6,3.5);
        gl.enable(gl.SCISSOR_TEST);
        bound=true;
      }
      gl.viewport(index*size,0,size,size);
      gl.scissor(index*size,0,size,size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(depth.u.VP,false,cascade.matrix);
      const casters=scene.filter(batch=>inFrustum(batch.bounds,cascade.planes));
      drawBatches(casters,cascade.planes,eye);
      for(const [kind,actor] of Object.entries(people))if(kind!=='effect')drawMesh(actor.mesh);
      actors.drawShadows(cascade.matrix,time,eye,cascade.planes);
      useWorldProgram(depth);
      gl.uniformMatrix4fv(depth.u.VP,false,cascade.matrix);
      cascade.last=time;
    }
    if(bound){
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      if(time-Math.min(cascades[0].last,cascades[1].last)<.2)shadowDirty=false;
    }
  }

  // options: fov (degrees, overrides the setting for this frame) and blur (0-1 speed blur strength).
  function render(eye,to,lighting,time,walkers,arrival,signal=SIGNAL_GREEN,options={}){
    renderedFrames++;frameIndex++;
    if(materialUpload)continueMaterialUpload();
    if(photoUpload)continuePhotoUpload();
    const fov=options.fov?clampFov(options.fov)*rad:FOV;
    // A single dynamic light per frame, for example an explosion: {position, intensity, color}.
    const light=options.light;
    flash.set(light?.intensity>0?[...light.position,light.intensity]:[0,0,0,0]);
    if(light?.color)flashColor=light.color;
    const movedActors=walkers!==previousWalkers;
    updateActors(walkers);
    if(!resize){clientWidth=canvas.clientWidth;clientHeight=canvas.clientHeight;}
    const dpi=devicePixelRatio||1;
    const normalScale=Math.min(dpi,quality==='high'?1.5:mobile?1:1.25);
    const scale=quality==='low'?Math.min(dpi,.75):quality==='auto'?normalScale*autoScale:normalScale;
    const w=Math.max(1,Math.round(clientWidth*scale)),h=Math.max(1,Math.round(clientHeight*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    try{post.resize(w,h);}
    catch(error){
      // Some drivers expose float color buffers but cannot attach them; fall back to 8-bit targets.
      if(!floatColor)throw error;
      console.info('Float render targets unavailable',error.message);
      post.dispose();floatColor=false;
      post=createPost(gl,{floatColor,compileProgram});
      for(const program of post.programs)program.resolve();
      post.resize(w,h);
    }
    const taa=quality!=='low'&&floatColor;
    const ssao=taa&&(quality==='high'||!mobile);
    const bloom=quality!=='low'&&floatColor;
    updateSky(lighting,time);
    const targetExposure=model.underground?6:8.2;
    const step=previousTime===null?1:Math.min(.25,Math.max(0,time-previousTime));
    previousTime=time;
    exposure+=(targetExposure-exposure)*(1-Math.exp(-step*4.8));
    renderSkyTexture();

    const jitter=taa?jitterSequence[frameIndex%jitterSequence.length]:[0,0];
    const jx=jitter[0]*2/w,jy=jitter[1]*2/h;
    const plain=cameraProjection(eye,to,w/h,fov);
    const vp=new Float32Array(plain);
    for(let i=0;i<4;i++){vp[i*4]+=jx*vp[i*4+3];vp[i*4+1]+=jy*vp[i*4+3];}
    const planes=frustumPlanes(plain);
    const shadowsWanted=quality!=='low'&&eye[1]>-3&&!shadowUnsupported&&!model.underground;
    if(shadowsWanted&&!shadowBuffer)shadowBuffer=createShadowBuffer();
    const shadows=shadowsWanted&&!!shadowBuffer;
    const forward=unit(to.map((n,i)=>n-eye[i]));

    const front=[];
    const ordered=scene.map(batch=>({batch,distance:distanceToBounds(batch.bounds,eye[0],eye[2])}));
    ordered.sort((a,b)=>a.distance-b.distance);
    for(const {batch} of ordered)if(inFrustum(batch.bounds,planes))front.push(batch);
    const casters=shadows?ordered.filter(({batch})=>cascades.some(c=>c.planes&&inFrustum(batch.bounds,c.planes))).map(o=>o.batch):[];
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
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if(shadows)renderShadows(eye,forward,time,movedActors);

    // Main pass into the linear HDR target.
    gl.bindFramebuffer(gl.FRAMEBUFFER,post.scene);
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,shadows?shadowBuffer.texture:placeholderShadow);
    gl.bindSampler(0,compareSampler);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,shadows?shadowBuffer.texture:placeholderShadow);
    gl.bindSampler(2,rawSampler);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfaceTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D,skyTexture);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,photoTexture);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D,photoTable);
    gl.activeTexture(gl.TEXTURE0);
    useWorldProgram(main);
    sendLighting(main.u,lighting,time,shadows);
    gl.uniformMatrix4fv(main.u.VP,false,vp);
    gl.uniform3fv(main.u.Eye,eye);
    gl.uniform1f(main.u.Signal,signal);
    gl.uniform1i(main.u.SurfaceMaps,1);
    gl.uniform1f(main.u.MaterialDetail,surfacesReady?(quality==='low'?1:2):0);
    drawBatches(front,planes,eye);
    for(const [kind,actor] of Object.entries(people))if(kind!=='effect')drawMesh(actor.mesh);
    actors.draw({vp,eye,time,planes,send:u=>sendLighting(u,lighting,time,shadows)});
    useWorldProgram(main);

    const right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(skies.program);
    sendLighting(skies.u,lighting,time,false);
    gl.uniform3fv(skies.u.Eye,eye);
    gl.uniform3fv(skies.u.Forward,forward);gl.uniform3fv(skies.u.Right,right);gl.uniform3fv(skies.u.Up,up);
    gl.uniform1f(skies.u.Ratio,w/h);
    gl.uniform2f(skies.u.Jitter,jx,jy);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES,0,3);

    gl.depthFunc(gl.LESS);
    useWorldProgram(main);
    gl.uniform1f(main.u.Dynamic,0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE);
    drawGlass(front,planes,eye,forward);
    drawMesh(people.effect.mesh);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for(const unitIndex of [0,2])gl.bindSampler(unitIndex,null);

    // Screen passes.
    const moved=previousEye?Math.hypot(eye[0]-previousEye[0],eye[1]-previousEye[1],eye[2]-previousEye[2]):Infinity;
    const sizeKey=w+'x'+h;
    const reset=!previousVP||moved>25||sizeKey!==previousSize;
    const inverse=invert(vp);
    const reproject=product(previousVP??plain,inverse);
    // Speed blur uses the previous position with the current rotation; its strength follows a
    // fixed shutter time, so it looks the same at any frame rate.
    let blur=0,blurReproject=null;
    // Phones skip it unless the high quality setting asks for every effect.
    if(options.blur>0&&taa&&(quality==='high'||!mobile)&&!reset&&moved>.004){
      blurReproject=product(cameraProjection(previousEye,previousEye.map((n,i)=>n+forward[i]),w/h,fov),inverse);
      blur=options.blur*Math.min(1,.0105/Math.max(step,1/240));
    }
    previousVP=plain;previousEye=[...eye];previousSize=sizeKey;
    const tan=Math.tan(fov/2);
    let sun=[0,0,0,0];
    if(!model.underground){
      const clip=[0,1,2,3].map(r=>plain[r]*model.sun[0]+plain[4+r]*model.sun[1]+plain[8+r]*model.sun[2]);
      if(clip[3]>0){
        const x=clip[0]/clip[3]*.5+.5,y=clip[1]/clip[3]*.5+.5;
        const facing=Math.max(0,dot(forward,model.sun));
        if(x>-.2&&x<1.2&&y>-.2&&y<1.2)sun=[x,y,0,facing*facing*1.4];
      }
    }
    post.run({ssao,taa,bloom,reproject,projection:[tan*w/h,tan,NEAR,FAR],frame:frameIndex,time,reset,
      outputWidth:w,outputHeight:h,sun,sunTint:model.sunColor,vignette:.3,blur,blurReproject,
      teleport:moved>25,adaptBand:model.underground?ADAPT_BAND_UNDERGROUND:ADAPT_BAND});
    return !arrival||residents.has(arrival)||!inFrustum(arrival.bounds,planes);
  }

  const renderer={
    load,render,
    get detailedActors(){return actors.ready;},
    // The surface maps (about 7.6 MB) go up a few layers per frame instead of in one long stall.
    setMaterials(bytes){
      if(materialUpload)gl.deleteTexture(materialUpload.texture);
      const texture=gl.createTexture();
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY,Math.log2(MATERIAL_SIZE)+1,gl.RGBA8,MATERIAL_SIZE,MATERIAL_SIZE,surfaceProfiles.length);
      gl.activeTexture(gl.TEXTURE0);
      materialUpload={texture,bytes,next:0};
    },
    // photos: {tile, layers: ImageBitmap-like sources tile x tile, table: Float32Array} from
    // loadGeneratedTextures(). The layers go up three per frame.
    setPhotoTextures({tile,layers,table}){
      if(!layers?.length)return;
      if(photoUpload)gl.deleteTexture(photoUpload.texture);
      const texture=gl.createTexture();
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY,Math.floor(Math.log2(tile))+1,gl.RGBA8,tile,tile,layers.length);
      gl.activeTexture(gl.TEXTURE0);
      photoUpload={texture,tile,layers:[...layers],table,next:0};
    },
    get photoTextures(){return photoReady;},
    setQuality(value){
      quality=value;autoScale=1;shadowDirty=true;
      for(const cascade of cascades)cascade.key='';
      // Light mode draws no shadows, so the atlas (8-32 MB of video memory) is released.
      if(value==='low'&&shadowBuffer){
        gl.deleteTexture(shadowBuffer.texture);gl.deleteFramebuffer(shadowBuffer.framebuffer);shadowBuffer=null;
      }
      post.invalidate();
    },
    setAutoScale(value){autoScale=value;},
    dispose(){
      resize?.disconnect();
      actors.dispose?.();
      post.dispose();
      for(const resident of residents.values()){
        for(const mesh of resident.meshes.values())gl.deleteVertexArray(mesh.vao);
        gl.deleteBuffer(resident.buffer);
      }
      residents.clear();
      for(const actor of Object.values(people)){gl.deleteVertexArray(actor.mesh.vao);gl.deleteBuffer(actor.buffer);}
      gl.deleteVertexArray(paneMesh.vao);gl.deleteBuffer(paneBuffer);
      for(const shape of Object.values(geometry)){gl.deleteBuffer(shape.buffer);gl.deleteBuffer(shape.elements);}
      for(const texture of [surfaceTexture,skyTexture,placeholderShadow,shadowBuffer?.texture,materialUpload?.texture,
        photoTexture,photoTable,photoUpload?.texture])if(texture)gl.deleteTexture(texture);
      materialUpload=null;photoUpload=null;
      for(const framebuffer of [skyFramebuffer,shadowBuffer?.framebuffer])if(framebuffer)gl.deleteFramebuffer(framebuffer);
      for(const sampler of [compareSampler,rawSampler])gl.deleteSampler(sampler);
      for(const program of [main,depth,skies,skyLut])try{gl.deleteProgram(program.program);}catch{}
      shadowBuffer=null;
    }
  };
  if(wait){
    for(const program of corePrograms)program.resolve();
    checkActors();
    renderer.ready=Promise.resolve(renderer);
  }else{
    renderer.ready=whenCompiled(gl,corePrograms)
      .then(()=>whenCompiled(gl,actors.programs??[]).catch(()=>{}))
      .then(()=>{checkActors();return renderer;});
  }
  return renderer;
}
export const normalize=unit;
export const vectorCross=cross;
