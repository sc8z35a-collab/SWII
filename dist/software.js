import {TRAIN_VARIANT,METRO_COLUMN,METRO_MATERIAL_BASE,METRO_PALETTE,isMetroMaterial,metroUv} from './metro-materials.js';
import {roofFaces,chamferFaces,taperFaces,windowFaces,paneFaces} from './models.js';
import {normalize,vectorCross,cameraProjection,displaySize} from './engine.js';
import {distanceToBounds,frustumPlanes,inFrustum} from './mesh-batches.js';
import {rasterizer,packedColor} from './software-raster.js';
import {terrainPolygons} from './terrain-polygon.js';
import {LAND,isSurface,unpackColor,unpackSlope} from './surfaces.js';
import {SIGNAL_GREEN,SIGNAL_RED,STREET_LAMP} from './street-lights.js';
import {facadeAppearance} from './facade-look.js';
import {APARTMENT_GLASS,CERAMIC_SHELL,EXHAUST,IGNITION,LIFT_MATERIAL_OFFSET,SHOCK,isGlazing,isRoomSurface,materialLayer,softwareMaterialMips,surfaceProfiles} from './architecture-materials.js';
import {AIRCRAFT} from './moving-models.js';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const blend=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const smoothstep=(a,b,x)=>{
  const t=clamp((x-a)/(b-a),0,1);
  return t*t*(3-2*t);
};
const seaColor=night=>blend([.27,.54,.59],[.074,.15,.24],night);

export function skyColor(light,x,y,z){
  const inverse=1/Math.hypot(x,y,z);
  const elevation=y*inverse;
  if(elevation>=1)return light.zenith;
  const sky=blend(light.horizon,light.zenith,Math.max(0,elevation)**.48);
  if(!light.ocean||elevation>=.001)return sky;
  const bearing=light.oceanBearing??[-1,0];
  const facing=Math.hypot(...bearing)<.1?1:smoothstep(.08,.41,(x*bearing[0]+z*bearing[1])*inverse);
  const water=light.ocean*facing*smoothstep(.001,.045,-elevation);
  return water>0?blend(sky,blend(light.horizon,seaColor(light.night),.78),water):sky;
}

function skyPainter(){
  const layer=document.createElement('canvas'),context=layer.getContext('2d');
  const width=layer.width=96,height=layer.height=64;
  const image=context.createImageData(width,height);
  const noise=(x,y)=>{
    const a=Math.floor(x),b=Math.floor(y),u=smoothstep(0,1,x-a),v=smoothstep(0,1,y-b);
    const hash=(i,j)=>((Math.imul(i,1597334677)^Math.imul(j,3812015801))>>>0)/4294967296;
    const p=hash(a,b)*(1-u)+hash(a+1,b)*u,q=hash(a,b+1)*(1-u)+hash(a+1,b+1)*u;
    return p*(1-v)+q*v;
  };
  let palette,viewKey;
  return function paint(ctx,w,h,forward,right,up,light){
    const aspect=w/h,key=[aspect,...forward].join(',');
    if(light!==palette||key!==viewKey){
      palette=light;viewKey=key;
      for(let row=0;row<height;row++){
        const v=(1-(row+.5)/height*2)*.589;
        const [a,b,c]=forward.map((n,i)=>n+up[i]*v);
        for(let col=0;col<width;col++){
          const u=((col+.5)/width*2-1)*aspect*.589;
          const x=a+right[0]*u,y=b+right[1]*u,z=c+right[2]*u;
          let sky=skyColor(light,x,y,z);
          if(y>.014&&light.night<1){
            const stretch=3.4/(y+Math.hypot(x,y,z)*.20);
            const px=x*stretch,py=z*stretch;
            const dx=px+noise(px*.91,py*.91)*.54,dz=py+noise(px*.86+5.2,py*.86+7.7)*.54;
            const cloud=noise(dx,dz)*.57+noise(dx*2.1,dz*2.1)*.28+noise(dx*4.4,dz*4.4)*.15;
            const opacity=smoothstep(.51,.74,cloud)*smoothstep(.018,.22,y)*.78*(1-light.night);
            const tint=blend([.74,.79,.84],[.98,.98,.96],smoothstep(.51,.75,cloud));
            sky=blend(sky,tint,opacity);
          }
          const index=(row*width+col)*4;
          image.data[index]=sky[0]*255;image.data[index+1]=sky[1]*255;image.data[index+2]=sky[2]*255;image.data[index+3]=255;
        }
      }
      context.putImageData(image,0,0);
    }
    ctx.drawImage(layer,0,0,w,h);
  };
}
const boxFaces=[
  [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],
  [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],
  [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],
  [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],
  [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],
  [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]
];
function cylinder(top,n){
  const bottom=[],roof=[],faces=[];
  for(let i=0;i<n;i++){
    const a=i*Math.PI*2/n,x=Math.cos(a)*.5,z=Math.sin(a)*.5;
    bottom.push([x,-.5,z]);roof.push([x*top,.5,z*top]);
  }
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    faces.push(top?[bottom[i],roof[i],roof[j],bottom[j]]:[bottom[i],roof[i],bottom[j]]);
  }
  faces.push(bottom);if(top)faces.push(roof.reverse());
  return faces;
}
function sphere(){
  const rings=[],faces=[];
  for(let i=0;i<=5;i++){
    const a=(i/5-.5)*Math.PI;
    rings.push(Array.from({length:8},(_,j)=>[Math.cos(a)*Math.cos(j*Math.PI/4)*.5,Math.sin(a)*.5,Math.cos(a)*Math.sin(j*Math.PI/4)*.5]));
  }
  for(let i=0;i<5;i++)for(let j=0;j<8;j++){
    const a=rings[i][j],b=rings[i+1][j],c=rings[i+1][(j+1)%8],d=rings[i][(j+1)%8];
    faces.push(i===4?[a,b,d]:i===0?[a,b,c]:[a,b,c,d]);
  }
  return faces;
}
const templates={tri:[[[0,0,0],[1,0,0],[0,0,1]]],box:boxFaces,roof:roofFaces,chamfer:chamferFaces,
  taper:taperFaces,window:windowFaces,pane:paneFaces,tube:cylinder(1,8),cone:cylinder(0,8),pyramid:cylinder(0,4),ball:sphere()};
const effectDisks=[1,.77,.51,.24].map(radius=>Array.from({length:12},(_,i)=>[
  Math.cos(i*Math.PI/6)*radius*.5,Math.sin(i*Math.PI/6)*radius*.5,0
]));
const flameOutline=width=>[[-.28,-.5],[-.5,-.37],[-.46,-.22],[-.30,.03],[-.20,.23],
  [-.09,.40],[0,.50],[.09,.40],[.20,.23],[.30,.03],[.46,-.22],[.5,-.37],[.28,-.5]].map(([x,y])=>[x*width,y]);
const flameBands=[1,.69,.36].map(flameOutline);
const facadeMaterials=[4,5,8,11,12,13,17,19,20,21,48,49,50,51,52,53];
const isCurtainWall=mat=>mat===19||mat===21;
const near=.15;
function clipPlane(points,distance){
  const visible=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);
    if(da>=0)visible.push(a);
    if((da<0)!==(db<0))visible.push(blend(a,b,da/(da-db)));
  }
  return visible;
}
function projectView(source,w,h,f){
  if(source.every(p=>p[2]<near))return null;
  const clipped=source.some(p=>p[2]<near);
  const points3=clipped?clipPlane(source,p=>p[2]-near):source;
  const p=points3.map(point=>{
    const inv=1/point[2],position=[w*.5+f*point[0]*inv,h*.5-f*point[1]*inv,inv];
    for(let i=3;i<point.length;i++)position.push(point[i]*inv);
    return position;
  });
  if(p.every(v=>v[0]<0)||p.every(v=>v[1]<0)||p.every(v=>v[0]>w)||p.every(v=>v[1]>h))return null;
  const z=points3.map(v=>v[2]);
  const offscreen=clipped||p.some(([x,y])=>x<0||x>w||y<0||y>h);
  return {p,z,clipped,source:offscreen?source:null,depth:z.reduce((n,v)=>n+v,0)/z.length};
}
function projectFace(points,convert,w,h,f,colors,uv){
  const view=colors||uv?points.map((point,i)=>{
    const p=convert(point);
    if(colors)p.push(...colors[i]);
    if(uv)p.push(...uv[i]);
    return p;
  }):points.map(convert);
  return projectView(view,w,h,f);
}
export function visibleFacade(quad,w,h,f){
  quad=quad.map(point=>point.slice(0,3));
  const uv=[[0,0],[1,0],[1,1],[0,1]];
  let visible=quad.map((point,i)=>[...point,...uv[i]]);
  const halfW=w/(2*f),halfH=h/(2*f);
  for(const distance of [p=>p[2]-near,p=>p[2]*halfW+p[0],p=>p[2]*halfW-p[0],
    p=>p[2]*halfH+p[1],p=>p[2]*halfH-p[1]])visible=clipPlane(visible,distance);
  if(visible.length<3)return null;
  const u=visible.map(p=>p[3]),v=visible.map(p=>p[4]);
  const point=(u,v)=>blend(blend(quad[0],quad[1],u),blend(quad[3],quad[2],u),v);
  return {bounds:[Math.min(...u),Math.min(...v),Math.max(...u),Math.max(...v)],
    cell(u,v,du,dv){return projectView([point(u,v),point(u+du,v),point(u+du,v+dv),point(u,v+dv)],w,h,f)?.p;}};
}
function facades(raster,face,projection,light,w,h,f){
  const {p,z,source,depth}=projection,{night}=light;
  const look=face.look;
  const [widthScale,storeyScale]=look?.eraProfile??[1,1];
  const [bayScale,margin,sillOffset,rail]=look?.windowProfile??[1,0,0,.5];
  const tower=isCurtainWall(face.mat)||face.mat===20,fins=face.mat===21,glass=face.mat===4||isCurtainWall(face.mat);
  const shop=face.mat===11,balcony=face.mat===12,stone=face.mat===8||face.mat===20,sand=face.mat===17;
  const rows=Math.min(120,Math.max(1,Math.floor(face.height/((tower?4.56:shop?4.26:balcony?3.77:3.68)*storeyScale))));
  const cols=Math.min(26,Math.max(1,Math.floor(face.width/((fins?2.7:glass?1.73:balcony?2.7:stone?2.35:2.13)*widthScale*bayScale))));
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const clipped=source&&visibleFacade(source,w,h,f);
  if(source&&!clipped||!projection.clipped&&(dist(p[0],p[1])<cols*2||dist(p[0],p[3])<rows*2))return;
  const sample=(x,y)=>{
    const a=(1-x)*(1-y)*z[0],b=x*(1-y)*z[1],c=x*y*z[2],d=(1-x)*y*z[3],depth=a+b+c+d;
    return [(p[0][0]*a+p[1][0]*b+p[2][0]*c+p[3][0]*d)/depth,
      (p[0][1]*a+p[1][1]*b+p[2][1]*c+p[3][1]*d)/depth,1/depth];
  };
  const cell=clipped?.cell??((x,y,dx,dy)=>[sample(x,y),sample(x+dx,y),sample(x+dx,y+dy),sample(x,y+dy)]);
  const [x0,y0,x1,y1]=clipped?.bounds??[0,0,1,1];
  const inset=clamp((glass?.065:shop?.085:balcony?.17:sand?.30:.22)+margin,.035,.42);
  const dy=glass?.75:shop?.66:balcony?.70:sand?.49:.58;
  const base=clamp((shop?.065:balcony?.17:.23)+sillOffset,.04,.32);
  const shade=clamp(depth*.0033,.03,.76);
  const pane=blend(glass?[.22,.31,.37]:[.18,.23,.26],light.horizon,shade);
  const reflective=blend(glass?[.34,.44,.50]:[.22,.27,.29],light.horizon,shade);
  const strength=smoothstep(.10,.85,night);
  const lamp=blend([.94,.72,.43],light.horizon,shade*.72);
  const warmRoom=blend([.38,.34,.27],light.horizon,shade);
  const tints=[packedColor(pane),packedColor(reflective),packedColor(blend(warmRoom,lamp,strength)),
    packedColor(blend(blend(warmRoom,reflective,.47),lamp,strength))];
  const frame=packedColor(blend([.58,.59,.56],light.horizon,.18));
  const curtainTint=packedColor(blend([.63,.60,.52],light.horizon,shade));
  const damp=look?.wear>=3&&depth<80?packedColor(blend([...face.color].map(n=>n*.57),light.horizon,shade)):null;
  for(let y=Math.max(0,Math.floor(y0*rows));y<Math.min(rows,Math.ceil(y1*rows));y++)
    for(let x=Math.max(0,Math.floor(x0*cols));x<Math.min(cols,Math.ceil(x1*cols));x++){
    const key=Math.abs(x*17+y*23+Math.floor(face.center[0]));
    const tint=tints[(key%13===0?2:0)+(key%5===0?1:0)];
    if(damp!==null&&key%7===0){
      const stain=cell((x+inset*.76)/cols,(y+.012)/rows,.14/cols,base/rows);
      if(stain)raster.fill(stain,damp,look.wear*.038,4e-7);
    }
    const window=cell((x+inset)/cols,(y+base)/rows,(1-inset*2)/cols,dy/rows);
    if(window)raster.fill(window,tint,1,5e-7);
    if(depth<54){
      if(key%4<2){
        const curtain=cell((x+inset+.018)/cols,(y+base+.017)/rows,(1-inset*2)*.23/cols,(dy-.029)/rows);
        if(curtain)raster.fill(curtain,curtainTint,glass?.35:.52,8e-7);
      }
      const mullion=cell((x+.49)/cols,(y+base)/rows,.025/cols,dy/rows);
      const sill=cell((x+inset)/cols,(y+base-.037)/rows,(1-inset*2)/cols,.028/rows);
      if(mullion)raster.fill(mullion,frame,glass?.68:1,1e-6);
      if(sill)raster.fill(sill,frame,glass?.51:1,1e-6);
      if(look?.era<2){
        const transom=cell((x+inset)/cols,(y+base+dy*rail)/rows,(1-inset*2)/cols,.020/rows);
        if(transom)raster.fill(transom,frame,1,1e-6);
      }
    }
  }
}
function convexOutline(points){
  const sorted=points.sort(([a,b],[c,d])=>a-c||b-d);
  function half(vertices){
    const result=[];
    for(const p of vertices){
      while(result.length>=2){
        const [ax,az]=result.at(-2),[bx,bz]=result.at(-1);
        if((bx-ax)*(p[1]-az)-(bz-az)*(p[0]-ax)>1e-7)break;
        result.pop();
      }
      result.push(p);
    }
    return result.slice(0,-1);
  }
  return [...half(sorted),...half(sorted.reverse())];
}
export function drapedShadow([center,x,z,height,kind='box'],sun,groundAt){
  const foot=groundAt(center[0],center[2]);
  if(!Number.isFinite(foot)||Math.abs(center[1]-height*.5-foot)>1.45)return [];
  const shift=Math.min(34,height/Math.max(.37,sun[1]));
  const base=templates[kind].at(-1);
  const top=kind==='taper'?templates[kind].at(-2):base;
  const place=([a,,b],length)=>[center[0]+a*x[0]+b*z[0]-length*sun[0],center[2]+a*x[2]+b*z[2]-length*sun[2]];
  const outline=convexOutline([...base.map(p=>place(p,0)),...top.map(p=>place(p,shift))]);
  const result=[];
  for(const polygon of terrainPolygons(outline)){
    const points=polygon.map(([x,z])=>[x,groundAt(x,z),z]);
    if(points.every(p=>Number.isFinite(p[1])))result.push(points.map(([x,y,z])=>[x,y+.238,z]));
  }
  return result;
}
export function softwareRenderer(canvas,groundAt){
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas rendering unavailable');
  let scene=[],detailRadius=139,viewRadius=240,resolution='fhd',showShadows=true,reflections=true,materials=null;
  const metroMaps=new Map();
  let actors=[],previousWalkers;
  const baked=new Map();
  let shadows=new WeakMap(),shadowLight='';
  const emptyBins=()=>({terrain:[],roads:[],ground:[],objects:[],shadows:[]});
  const raster=rasterizer();
  const paintSky=skyPainter();
  function append(world,bins,shadowList){
    for(const [kind,faces] of Object.entries(templates)){
      const data=world[kind]??[];
      for(let i=0;i<data.length;i+=16){
        const pos=data.slice(i,i+3),x=data.slice(i+3,i+6),y=data.slice(i+6,i+9),z=data.slice(i+9,i+12);
        const rawMat=Math.floor(data[i+15]),metro=isMetroMaterial(rawMat),lift=!metro&&rawMat>=LIFT_MATERIAL_OFFSET;
        const values=data.slice(i+12,i+15);
        const palette=metro?METRO_PALETTE[rawMat-METRO_MATERIAL_BASE]:null;
        const color=metro?[0,2,4].map(i=>parseInt(palette.slice(i,i+2),16)/255):values;
        const mat=metro?0:lift?rawMat-LIFT_MATERIAL_OFFSET:rawMat,height=Math.hypot(...y);
        const accessory=data[i+15]-rawMat>=.2499,look=facadeAppearance(lift?data[i+15]-LIFT_MATERIAL_OFFSET:data[i+15]);
        const layer=materialLayer(mat,look?.era);
        const roofAxes=mat===14?[normalize(x),normalize(z),pos]:null;
        const isGround=kind==='box'&&height<=.55&&pos[1]<.14&&(mat===1||mat===3||mat===9)&&
          Math.hypot(...x)>=6&&Math.hypot(...z)>=6;
        const smooth=kind==='tri'&&isSurface(mat)?{normals:[...y].map(unpackSlope),colors:[...color].map(unpackColor)}:null;
        let target=bins.objects;
        if(kind==='tri'&&!metro)target=mat===9||mat===3||mat===LAND?bins.terrain:
          smooth||Math.abs(y[1])>=.18?bins.roads:bins.objects;
        else if(isGround)target=bins.ground;
        if((kind==='box'||kind==='chamfer'||kind==='taper')&&height>4&&Math.hypot(...x)>3&&Math.hypot(...z)>3){
          shadowList.push([pos,x,z,height,kind]);
        }
        for(const model of isGround?[faces[4]]:faces){
          const points=model.map(([a,b,c])=>pos.map((v,j)=>v+a*x[j]+b*y[j]+c*z[j]));
          const normal=normalize(vectorCross(points[1].map((v,j)=>v-points[0][j]),points[2].map((v,j)=>v-points[0][j])));
          const center=pos.map((_,j)=>points.reduce((n,p)=>n+p[j],0)/points.length);
          const width=Math.hypot(points[1][0]-points[0][0],points[1][2]-points[0][2]);
          const radius=Math.max(...points.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])));
          const detail=(kind==='box'||kind==='chamfer'||kind==='taper')&&Math.abs(normal[1])<.39&&facadeMaterials.includes(mat);
          const onGround=isGround||kind==='tri'&&!metro&&target===bins.roads&&mat!==AIRCRAFT;
          target.push({points,normal,center,radius,color,mat,height,width,accessory,detail,smooth,onGround,look,layer,roofAxes,lift,
            metro:metro?{id:data[i+15],uv:Array.from(values,metroUv)}:null});
        }
      }
    }
  }
  function load(batches,range,radius=240){
    scene=batches;
    detailRadius=range;
    viewRadius=radius;
    shadows=new WeakMap();
    const present=new Set(scene);
    for(const batch of baked.keys())if(!present.has(batch))baked.delete(batch);
  }
  function prepare(batch){
    const layers=batch.ranges.map(range=>{
      const bins=emptyBins();
      const data=batch.data.subarray(range.start,range.start+range.count*16);
      append({[range.kind]:data},bins,bins.shadows);
      return {range,bins};
    });
    baked.set(batch,layers);
    return layers;
  }
  function render(eye,to,light,_time,walkers,arrival,signal=SIGNAL_GREEN,inHand,options={}){
    if(walkers!==previousWalkers){
      actors=[];previousWalkers=walkers;
      if(walkers)append(walkers,{terrain:actors,roads:actors,ground:actors,objects:actors},[]);
    }
    const [w,h]=displaySize(canvas.clientWidth,canvas.clientHeight,resolution);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const fov=(options.fov??61)*Math.PI/180;
    const planes=frustumPlanes(cameraProjection(eye,to,w/h,fov)),layers=[];
    let prepared=false;
    if(arrival&&!baked.has(arrival)&&inFrustum(arrival.bounds,planes)){
      prepare(arrival);prepared=true;
    }
    for(const batch of scene){
      if(!inFrustum(batch.bounds,planes))continue;
      let ready=baked.get(batch);
      if(!ready&&!prepared){ready=prepare(batch);prepared=true;}
      if(!ready)continue;
      for(const {range,bins} of ready){
        if(range.detail&&distanceToBounds(range.bounds,eye[0],eye[2])>detailRadius**2)continue;
        if(inFrustum(range.bounds,planes))layers.push(bins);
      }
    }
    raster.begin(w,h);
    const forward=normalize(to.map((v,i)=>v-eye[i])),right=normalize(vectorCross(forward,[0,1,0])),up=vectorCross(right,forward);
    const f=h/(2*Math.tan(fov/2));
    paintSky(ctx,w,h,forward,right,up,light);
    const sea=blend(light.horizon,seaColor(light.night),.76);
    const convert=p=>{
      const d=[p[0]-eye[0],p[1]-eye[1],p[2]-eye[2]];
      return [dot(d,right),dot(d,up),dot(d,forward)];
    };
    function reflectedColor(face,point){
      if(!reflections)return face.color;
      const n=face.normal,ray=normalize(eye.map((value,i)=>value-point[i]));
      const cosine=dot(n,ray),grazing=(1-Math.abs(cosine))**3;
      const reflected=ray.map((value,i)=>2*cosine*n[i]-value);
      const sky=skyColor(light,...reflected);
      const street=1-smoothstep(-.42,.16,reflected[1]);
      const reflection=blend(sky,blend([.33,.36,.34],[.055,.075,.112],light.night),street*.82);
      const seed=Math.abs(Math.floor(face.center[0]*29+face.center[1]*61+face.center[2]*17))%97/97;
      const warm=face.look?smoothstep(.65,.76,seed)*light.night:0;
      const inside=blend([...face.color].map(n=>n*(.76-.55*light.night)),[.87,.66,.37],warm);
      return blend(inside,reflection,.33+grazing*.51);
    }
    const sunDir=[dot(light.sun,right),dot(light.sun,up),dot(light.sun,forward)];
    const daylight=1-light.night;
    if(sunDir[2]>.17&&daylight>0){
      ctx.save();ctx.globalAlpha=daylight;
      const sx=w*.5+f*sunDir[0]/sunDir[2],sy=h*.5-f*sunDir[1]/sunDir[2],r=h*.51;
      const glow=ctx.createRadialGradient(sx,sy,0,sx,sy,r);
      glow.addColorStop(0,'rgba(255,217,158,.58)');glow.addColorStop(.19,'rgba(244,185,131,.30)');glow.addColorStop(1,'rgba(245,177,115,0)');
      ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
      ctx.beginPath();ctx.arc(sx,sy,h*.014,0,Math.PI*2);ctx.fillStyle='#ffe3b6';ctx.fill();
      ctx.restore();
    }
    function draw(face,projected){
      const {p,depth,texture}=projected;
      if(face.smooth||face.mat===3||face.onGround||face.mat===10||face.metro&&texture){raster.fill(p,0,1,0,texture,projected.brightness);return;}
      if(isGlazing(face.mat)){
        const ray=normalize(eye.map((v,i)=>v-face.center[i]));
        const grazing=(1-Math.abs(dot(face.normal,ray)))**3;
        const clarity=1-smoothstep(20,210,depth)*.94;
        const opacity=face.mat===APARTMENT_GLASS?.068+grazing*.51:.14+grazing*.49;
        raster.fill(p,packedColor(reflectedColor(face,face.center)),opacity*clarity);return;
      }
      const incidence=Math.max(0,dot(face.normal,light.sun));
      const shade=isRoomSurface(face.mat)?[.87,.85,.82]:blend(
        [.67+incidence*.33,.70+incidence*.29,.73+incidence*.24],
        [.38+incidence*.20,.46+incidence*.19,.58+incidence*.15],light.night);
      const altitude=clamp((face.center[1]-34)/110,0,1);
      const haze=clamp(1-Math.exp(-Math.max(0,depth)*light.haze*(.75-altitude*.27)),0,face.lift?.50:face.mat===AIRCRAFT?.64:.79);
      const streetStrength=face.mat>=SIGNAL_GREEN&&face.mat<=SIGNAL_RED?(face.mat===signal?1.14:.12):
        face.mat===STREET_LAMP?.34+smoothstep(.16,.65,light.night)*.82:null;
      const wear=face.mat===10?0:face.look?.wear??0;
      const wearShade=1-wear*(.011+.011*Math.abs(face.normal[2]));
      const lit=face.color.map((v,i)=>v*wearShade*(streetStrength??(face.mat===IGNITION?1.35:face.mat===7?.92+light.night*.2:shade[i])));
      const tint=packedColor(blend(lit,light.horizon,haze));
      const visible=raster.fill(p,tint,1,0,texture);
      if(visible&&face.detail&&face.points.length===4&&depth<(isCurtainWall(face.mat)||face.mat===20?360:100))facades(raster,face,projected,light,w,h,f);
    }
    function project(face){
      let colors;
      if(face.mat===10)colors=face.points.map(point=>reflectedColor(face,point));
      else if(!face.metro&&(face.smooth||face.mat===3||face.onGround)){
        colors=face.points.map((point,i)=>{
          const n=face.smooth?.normals[i]??face.normal,incidence=Math.max(0,dot(n,light.sun));
          const shade=blend([.67+incidence*.33,.70+incidence*.29,.73+incidence*.24],
            [.38+incidence*.20,.46+incidence*.19,.58+incidence*.15],light.night);
          const horizontal=Math.hypot(point[0]-eye[0],point[2]-eye[2]);
          const distance=Math.hypot(horizontal,point[1]-eye[1]);
          const altitude=clamp((point[1]-34)/110,0,1);
          const fog=clamp(1-Math.exp(-distance*light.haze*(.75-altitude*.27)),0,.94);
          const color=face.smooth?.colors[i]??face.color;
          const lit=blend(Array.from(color,(n,j)=>n*shade[j]),face.mat===3?sea:light.horizon,fog);
          const fadeStart=face.mat===3?.24:.58;
          const edge=Math.max(smoothstep(fadeStart,.80,horizontal/viewRadius),
            1-smoothstep(0,113,Math.min(4000-Math.abs(point[0]),3000-Math.abs(point[2]))));
          const air=edge?skyColor(light,point[0]-eye[0],point[1]-eye[1],point[2]-eye[2]):null;
          return air?blend(lit,air,edge*edge*(3-2*edge)):lit;
        });
      }
      if(face.metro){
        const texture=metroMaps.get(face.metro.id)??metroMaps.get(Math.floor(face.metro.id));
        if(texture){
          const fog=Math.exp(-Math.hypot(...face.center.map((n,i)=>n-eye[i]))*.011);
          const shade=.71+.28*Math.max(0,face.normal[1]);
          const result=projectFace(face.points,convert,w,h,f,null,face.metro.uv);
          if(result){result.texture=texture;result.brightness=shade*fog;}
          return result;
        }
      }
      const far=126;
      const profile=surfaceProfiles[face.layer],texture=materials?.[face.layer];
      let uv;
      if(texture&&((face.center[0]-eye[0])**2+(face.center[1]-eye[1])**2+
        (face.center[2]-eye[2])**2)<(far+face.radius)**2){
        const [nx,ny,nz]=face.normal,ground=Math.abs(ny)>.63||face.mat===1||face.mat===2||face.mat===9||
          face.mat>=26&&face.mat<29;
        if(face.mat===CERAMIC_SHELL){
          uv=face.points.map(([x,y,z])=>[x/profile.width,(z-y*.48)/profile.height]);
        }else if(face.roofAxes){
          const [x,z,center]=face.roofAxes;
          uv=face.points.map(point=>{
            const delta=point.map((value,i)=>value-center[i]);
            return [dot(delta,x)/profile.width,dot(delta,z)/profile.height];
          });
        }else if(ground){
          uv=face.points.map(([x,,z])=>[x/profile.width,z/profile.height]);
        }else{
          const length=Math.hypot(nx,nz)*profile.width;
          uv=face.points.map(([x,y,z])=>[(x*nz-z*nx)/length,y/profile.height]);
        }
      }
      const projected=projectFace(face.points,convert,w,h,f,colors,uv);
      if(projected&&uv)projected.texture=texture;
      return projected;
    }
    function inView(face){
      const x=face.center[0]-eye[0],y=face.center[1]-eye[1],d=face.center[2]-eye[2];
      const z=x*forward[0]+y*forward[1]+d*forward[2],margin=face.radius;
      const far=face.lift?1200:face.mat===AIRCRAFT?1150:face.accessory?96:face.mat>=19&&face.mat<=21?820:455;
      if(z+margin<=.15||z-margin>far)return false;
      if(face.accessory&&margin*f<z*.55)return false;
      return Math.abs(x*right[0]+y*right[1]+d*right[2])<z*w/h*.589+margin*1.8&&
        Math.abs(x*up[0]+y*up[1]+d*up[2])<z*.589+margin*1.55;
    }
    for(const bins of layers)for(const layer of [bins.terrain,bins.roads,bins.ground])for(const face of layer){
      if(!inView(face))continue;
      const projected=project(face);
      if(projected)draw(face,projected);
    }
    if(groundAt&&showShadows&&light.night<.5){
      const key=light.sun.map(n=>Math.round(n*12)).join(',');
      if(key!==shadowLight){shadowLight=key;shadows=new WeakMap();}
      for(const bins of layers)for(const caster of bins.shadows){
        const [center]=caster;
        const distance=Math.hypot(center[0]-eye[0],center[2]-eye[2]);
        if(distance>=72)continue;
        const opacity=.25*clamp((72-distance)/22,0,1);
        if(!shadows.has(caster))shadows.set(caster,drapedShadow(caster,light.sun,groundAt));
        for(const polygon of shadows.get(caster)){
          const shadow=projectFace(polygon,convert,w,h,f);
          if(shadow)raster.shade(shadow.p,0x312619,opacity);
        }
      }
    }
    const visible=[],glazing=[];
    for(const layer of [...layers.map(bins=>bins.objects),actors])for(const face of layer){
      if(!inView(face))continue;
      const diff=[eye[0]-face.center[0],eye[1]-face.center[1],eye[2]-face.center[2]];
      if(!isGlazing(face.mat)&&dot(face.normal,diff)<=0)continue;
      const projected=project(face);
      if(projected)(isGlazing(face.mat)?glazing:visible).push([face,projected]);
    }
    visible.sort((a,b)=>a[1].depth-b[1].depth);
    for(const [face,projected] of visible)draw(face,projected);
    glazing.sort((a,b)=>b[1].depth-a[1].depth);
    for(const [face,projected] of glazing)draw(face,projected);
    const effects=walkers?.effect??[];
    for(let at=0;at<effects.length;at+=16){
      const p=effects.slice(at,at+3),x=effects.slice(at+3,at+6),y=effects.slice(at+6,at+9);
      const c=packedColor(effects.slice(at+12,at+15)),raw=effects[at+15],mat=Math.floor(raw),alpha=raw-mat;
      if(mat<IGNITION||mat>SHOCK)continue;
      const flame=mat===IGNITION,shapes=flame?flameBands:effectDisks;
      for(let i=0;i<shapes.length;i++){
        const points=shapes[i].map(([a,b])=>p.map((n,j)=>n+x[j]*a+y[j]*(flame?b*(1-i*.20)-i*.1:b)));
        const shape=projectFace(points,convert,w,h,f);
        const tint=flame?[0x225eff,0x90c8ff,0xd8fcff][i]:c;
        if(shape)raster.fill(shape.p,tint,alpha*(flame?[.47,.57,.84][i]:[.09,.14,.22,.28][i]));
      }
    }
    if(inHand){
      const held=[];
      append(inHand,{terrain:held,roads:held,ground:held,objects:held},[]);
      for(const face of held){
        const projected=projectFace(face.points,convert,w,h,f);
        if(projected)raster.fill(projected.p,packedColor(face.color));
      }
    }
    raster.present(ctx);
    return !arrival||baked.has(arrival)||!inFrustum(arrival.bounds,planes);
  }
  return {load,render,setMaterials(bytes){materials=softwareMaterialMips(bytes);},
    setPhotoTextures({layers,table}){
      const layerCanvas=document.createElement('canvas'),context=layerCanvas.getContext('2d',{willReadFrequently:true});
      for(let i=0;i<METRO_PALETTE.length;i++){
        for(let variant=0;variant<2;variant++){
          const index=table[(METRO_COLUMN+i)*4+variant];
          if(index<0)continue;
          const levels=[];
          for(let size=128;size>=4;size/=2){
            layerCanvas.width=size;layerCanvas.height=size;
            context.drawImage(layers[index],0,0,size,size);
            levels.push({size,bytes:context.getImageData(0,0,size,size).data,rgb:true});
          }
          metroMaps.set(METRO_MATERIAL_BASE+i+variant*TRAIN_VARIANT,levels);
        }
      }
      for(const layer of layers)layer.close?.();
    },
    setDisplay(options){
      resolution=options.resolution??resolution;
      showShadows=options.shadows??showShadows;
      reflections=options.reflections??reflections;
    },
    software:true};
}
