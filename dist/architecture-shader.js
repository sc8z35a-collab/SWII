import {CERAMIC_SHELL,MATERIAL_SIZE,materialLayers,surfaceProfiles} from './architecture-materials.js';

// Surface textures, reflections of the surrounding city and the rooms seen through windows.
// Every function returns linear radiance or linear albedo for the physically based shading.
export const architectureShader=`
const int surfaceMap[${materialLayers.length}]=int[](${materialLayers.join(',')});
const vec3 surfaceScale[${surfaceProfiles.length}]=vec3[](${surfaceProfiles.map(({width,height,relief})=>
  `vec3(${width.toFixed(3)},${height.toFixed(3)},${relief.toFixed(4)})`).join(',')});

// Image-generated textures (see generated-textures.js). uPhotoTable rows 0 and 1 list up to eight
// texture layers per material (-1 for none), row 2 holds each layer's width in meters, tint and mean
// linear luminance, and row 3 its roughness and relief. A building keeps one variant on every part:
// the choice hashes its position on a 24 m grid. Terrain triangles always use the first layer.
// One of the layers listed in a table column, chosen by pick (0-1); -1 when the column is empty.
int listedLayer(int column,float pick){
  if(uPhotoReady<.5)return -1;
  vec4 a=texelFetch(uPhotoTable,ivec2(column,0),0),b=texelFetch(uPhotoTable,ivec2(column,1),0);
  float count=a.x<0.?0.:a.y<0.?1.:a.z<0.?2.:a.w<0.?3.:b.x<0.?4.:b.y<0.?5.:b.z<0.?6.:b.w<0.?7.:8.;
  if(count<1.)return -1;
  int i=int(floor(clamp(pick,0.,.9999)*count));
  return int(i==0?a.x:i==1?a.y:i==2?a.z:i==3?a.w:i==4?b.x:i==5?b.y:i==6?b.z:b.w);
}
int photoLayer(int mat){
  if(mat<0||mat>=64)return -1;
  return listedLayer(mat,mat>=26&&mat<=28?0.:hash(floor(center.xz/24.)+vec2(float(mat)*7.31,3.7)));
}
// A picture for a room (columns 64-67) or a rug (column 68), sampled whole with a clamp at its edges.
vec3 roomPicture(int column,float pick,vec2 uv){
  int layer=listedLayer(column,pick);
  if(layer<0)return vec3(-1.);
  vec3 c=textureLod(uPhotoMaps,vec3(clamp(uv,.004,.996),float(layer)),1.).rgb;
  return c*c;
}
vec3 photoMaterial(vec3 base,inout vec3 normal,int mat,int photo,float footprint,out float roughness,out float cavity){
  vec4 info=texelFetch(uPhotoTable,ivec2(photo,2),0),surface=texelFetch(uPhotoTable,ivec2(photo,3),0);
  bool ground=abs(normal.y)>.63||mat==1||mat==2||mat==9||(mat>=26&&mat<29)||(mat>=35&&mat<=38);
  vec3 tangent=ground?vec3(1.,0.,0.):normalize(vec3(normal.z,0.,-normal.x)+vec3(1e-5,0.,0.));
  vec3 up=ground?vec3(0.,0.,1.):vec3(0.,1.,0.);
  // Image rows run downward, so walls read the texture with up pointing to the top of the photo.
  vec2 uv=vec2(dot(wPos,tangent),-dot(wPos,up))/info.xy;
  if(mat==14)uv=localPos.xz/info.xy;
  if(mat==${CERAMIC_SHELL})uv=vec2(wPos.x,wPos.z-wPos.y*.48)/info.xy;
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  vec3 photoColor=textureGrad(uPhotoMaps,vec3(uv,float(photo)),dx,dy).rgb;
  float level=luminance(photoColor*photoColor);
  float fine=1.-smoothstep(.029,.161,footprint);
  if(uQuality>.5&&fine>.02){
    // Relief from the photo's own light and shade: joints and pits are darker and sit lower.
    float texel=1./float(textureSize(uPhotoMaps,0).x);
    float across=luminance(textureGrad(uPhotoMaps,vec3(uv+vec2(texel,0.),float(photo)),dx,dy).rgb);
    float vertical=luminance(textureGrad(uPhotoMaps,vec3(uv+vec2(0.,texel),float(photo)),dx,dy).rgb);
    vec2 tilt=(vec2(across,vertical)-luminance(photoColor))*surface.y/(info.xy*texel)*fine*.9;
    normal=normalize(normal-tangent*tilt.x+up*tilt.y);
  }
  float shade=level/max(info.w,.01);
  cavity=mix(1.,.86+.14*smoothstep(.15,.9,shade),fine*.8+.2);
  roughness=clamp(surface.x+(.5-min(shade,1.5)*.33)*.12,.12,.97);
  // tint 0 keeps the photo's colors (nudged toward the building's brightness), tint 1 keeps only its
  // light and shade on the building's own color.
  vec3 natural=photoColor*clamp(pow(luminance(base*base)/max(info.w,.01),.15),.82,1.22);
  vec3 colored=base*sqrt(min(shade,3.));
  float macro=noise(wPos.xz*.071+wPos.y*.05)*.6+noise(wPos.xz*.23-wPos.y*.11)*.4;
  return mix(natural,colored,info.z)*(.94+macro*.12);
}
vec3 facadeMaterial(vec3 base,inout vec3 normal,int mat,int era,float footprint,out float roughness,out float cavity){
  roughness=.72;cavity=1.;
  int photo=photoLayer(mat==5&&era>=4?33:mat);
  if(photo>=0)return photoMaterial(base,normal,mat,photo,footprint,roughness,cavity);
  int layer=mat>=0&&mat<${materialLayers.length}?surfaceMap[mat]:-1;
  if(mat==5&&era>=4)layer=4;
  if(uMaterialDetail<.5||layer<0)return base;
  vec3 scale=surfaceScale[layer];
  bool ground=abs(normal.y)>.63||mat==1||mat==2||mat==9||(mat>=26&&mat<29)||(mat>=35&&mat<=38);
  vec3 tangent=ground?vec3(1.,0.,0.):normalize(vec3(normal.z,0.,-normal.x)+vec3(1e-5,0.,0.));
  vec3 up=ground?vec3(0.,0.,1.):vec3(0.,1.,0.);
  vec2 uv=vec2(dot(wPos,tangent),dot(wPos,up))/scale.xy;
  if(mat==14)uv=localPos.xz/scale.xy;
  if(mat==${CERAMIC_SHELL})uv=vec2(wPos.x,wPos.z-wPos.y*.48)/scale.xy;
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  vec4 texel=textureGrad(uSurfaceMaps,vec3(uv,float(layer)),dx,dy);
  float fine=1.-smoothstep(.029,.161,footprint);
  if(uMaterialDetail>1.5&&fine>.02){
    const float stepUV=1./${MATERIAL_SIZE}.;
    float across=textureGrad(uSurfaceMaps,vec3(uv+vec2(stepUV,0.),float(layer)),dx,dy).g;
    float vertical=textureGrad(uSurfaceMaps,vec3(uv+vec2(0.,stepUV),float(layer)),dx,dy).g;
    vec2 tilt=(vec2(across,vertical)-texel.gg)*scale.z/(scale.xy*stepUV)*fine;
    normal=normalize(normal-tangent*tilt.x*1.35-up*tilt.y*1.35);
  }
  // Mortar joints and pits sit lower than the faces and receive less light.
  cavity=mix(1.,.62+.38*smoothstep(.12,.55,texel.g),fine*.85+.15);
  roughness=clamp(texel.b,.19,.97);
  float warmth=(texel.a-.5)*.20;
  // Large scale variation keeps a repeating texture from reading as a pattern.
  float macro=noise(wPos.xz*.071+wPos.y*.05)*.6+noise(wPos.xz*.23-wPos.y*.11)*.4;
  return base*(.64+texel.r*.72)*(.92+macro*.16)*vec3(1.+warmth*.8,1.+warmth*.1,1.-warmth*.6);
}

// Reflections of a city street: sky above, a varied skyline with windows and lit facades
// near the horizon, and the street below.
vec3 cityReflection(vec3 r,float roughness){
  if(uUnderground>.5)return ambientLight(r)*.8;
  vec3 sky=skyLUT(vec3(r.x,max(r.y,.015),r.z));
  float heading=atan(r.x,r.z)*7.6;
  float column=floor(heading),across=fract(heading);
  float building=hash(vec2(column,14.));
  float roof=mix(.02,.30,building*building)*(1.-roughness*.6);
  float gap=smoothstep(.03,.10,min(across,1.-across));
  float edge=(1.-smoothstep(roof-.012,roof+.012,r.y))*mix(.35,1.,gap);
  vec3 facadeNormal=normalize(vec3(-r.x,0.,-r.z)+vec3(1e-4,0.,0.));
  float lit=max(dot(facadeNormal,uSun),0.);
  vec3 albedo=mix(vec3(.18,.19,.20),vec3(.42,.38,.33),hash(vec2(column,3.)));
  float rows=smoothstep(.35,.5,fract(r.y*(70.+building*60.)))*smoothstep(.0,.04,r.y);
  vec3 facade=albedo*(uSunColor*lit*.72+uAmbSun*1.35+uBounce)*(1.-rows*.55)+skyLUT(vec3(r.x,.12,r.z))*rows*.35;
  vec3 street=uGroundRad*mix(.85,1.25,noise(r.xz*9.));
  vec3 color=mix(sky,facade,edge*smoothstep(-.02,.0,r.y));
  return mix(color,street,1.-smoothstep(-.06,.004,r.y));
}

// A furnished room behind a window cell, traced as a box. cell is the window grid index,
// f the position in the cell, size the cell in meters and dir the view ray in facade space
// (x along the facade, y up, z into the building). office selects open plan floors.
vec3 interiorRadiance(vec2 cell,vec2 f,vec2 size,vec3 dir,vec3 sunLocal,float office,
  vec4 opening,vec2 seed,out float curtainCover){
  curtainCover=0.;
  float level=cell.y;
  float span=office>.5?6.:1.+floor(hash(vec2(level*7.13+seed.y,floor(cell.x/3.)+seed.x))*2.99);
  float roomIndex=floor(cell.x/span);
  vec2 room=vec2(roomIndex,level)+seed*13.;
  float pick=hash(room),pick2=hash(room+71.3),pick3=hash(room+19.7);
  float W=span*size.x,H=size.y,D=office>.5?mix(9.,14.,pick2):mix(4.2,7.5,pick2);
  float ceiling=H*.9;
  vec3 p0=vec3((cell.x-roomIndex*span+f.x)*size.x,f.y*H,0.);
  vec3 d=dir;
  d.z=max(d.z,.02);
  vec3 safe=vec3(d.x<0.?-1.:1.,d.y<0.?-1.:1.,1.)*max(abs(d),vec3(1e-4));
  float tx=(safe.x>0.?W-p0.x:-p0.x)/safe.x;
  float ty=(safe.y>0.?ceiling-p0.y:-p0.y)/safe.y;
  float tz=D/safe.z;
  float t=min(min(tx,ty),tz);
  vec3 hp=p0+d*t;

  // Palette for this room.
  vec3 wall=office>.5?mix(vec3(.70,.70,.68),vec3(.80,.78,.74),pick):
    mix(mix(vec3(.82,.77,.68),vec3(.66,.72,.70),step(.55,pick)),vec3(.86,.83,.80),step(.82,pick));
  vec3 floorColor=office>.5?mix(vec3(.22,.23,.25),vec3(.35,.33,.30),pick3):
    mix(vec3(.42,.27,.16),vec3(.58,.44,.30),pick3);
  vec3 albedo;vec3 normal;float emissive=0.;
  if(t==tz){
    albedo=wall;normal=vec3(0.,0.,-1.);
    vec2 q=vec2(hp.x/W,hp.y/H);
    if(office>.5){
      float board=step(.35,q.y)*step(q.y,.62)*step(abs(fract(q.x*2.+pick)-.5),.18);
      albedo=mix(albedo,vec3(.86,.87,.86),board);
      float door=step(abs(q.x-fract(pick*3.1)),.05)*step(q.y,.62);
      albedo=mix(albedo,vec3(.32,.30,.28),door);
    }else{
      float sofa=step(abs(q.x-.5+pick*.2-.1),.28)*step(q.y,.26)*step(.05,q.y);
      float back=step(abs(q.x-.5+pick*.2-.1),.3)*step(q.y,.34)*step(.2,q.y);
      vec3 fabric=mix(vec3(.25,.33,.42),vec3(.52,.36,.26),pick2);
      float shelf=step(abs(q.x-.12-pick3*.1),.09)*step(q.y,.72);
      float books=shelf*step(.5,fract(q.y*9.))*step(.2,fract(q.x*40.+pick));
      float art=step(abs(q.x-.62),.1)*step(abs(q.y-.52),.08);
      albedo=mix(albedo,fabric,max(sofa,back*.9));
      albedo=mix(albedo,vec3(.36,.24,.15),shelf);
      albedo=mix(albedo,mix(vec3(.6,.2,.15),vec3(.2,.35,.5),hash(floor(hp.xy*vec2(40.,9.)))),books);
      albedo=mix(albedo,mix(vec3(.75,.62,.45),vec3(.25,.4,.55),pick),art);
      // A framed picture from the generated art: icons, frescoes, mosaics and sea photographs.
      float side=min(.95,H*.3);
      vec2 frame=(hp.xy-vec2(W*.62,H*.56))/side;
      if(max(abs(frame.x),abs(frame.y))<.5){
        vec3 picture=roomPicture(64+int(pick3*4.),fract(pick*5.3+pick2*2.1),vec2(frame.x+.5,.5-frame.y));
        if(picture.x>=0.){
          float border=1.-step(max(abs(frame.x),abs(frame.y)),.455);
          albedo=mix(picture,vec3(.11,.08,.05),border);
        }
      }
    }
  }else if(t==ty){
    if(safe.y<0.){
      albedo=floorColor;normal=vec3(0.,1.,0.);
      if(office<.5){
        float plank=fract(hp.x*4.2+floor(hp.z*.8+hash(vec2(floor(hp.x*4.2),5.))*3.)*.37);
        albedo*=.86+.18*hash(vec2(floor(hp.x*4.2),floor(hp.z*.8)))-.12*(1.-smoothstep(.0,.04,min(plank,1.-plank)));
        float rug=step(abs(hp.x-W*.5),W*.28)*step(abs(hp.z-D*.45),D*.22);
        vec3 woven=roomPicture(68,pick,vec2((hp.x-W*.22)/(W*.56),(hp.z-D*.23)/(D*.44)));
        albedo=mix(albedo,woven.x>=0.?woven:mix(vec3(.55,.48,.40),vec3(.30,.36,.44),pick),rug*step(.3,pick2));
      }else albedo*=.92+.1*noise(hp.xz*6.);
    }else{
      albedo=vec3(.84,.83,.80);normal=vec3(0.,-1.,0.);
      if(office>.5){
        vec2 g=fract(hp.xz/vec2(1.2,1.8));
        float panel=step(abs(g.x-.5),.22)*step(abs(g.y-.5),.16);
        emissive=panel*step(.18,pick3);
        albedo*=1.-.12*(1.-smoothstep(.0,.03,min(min(g.x,1.-g.x),min(g.y,1.-g.y))));
      }else{
        float lamp=1.-smoothstep(.10,.16,length(hp.xz-vec2(W*.5,D*.5)));
        emissive=lamp*step(.62,pick3)*.8;
      }
    }
  }else{
    albedo=wall*.94;normal=vec3(-sign(safe.x),0.,0.);
    float frame=step(abs(hp.z-D*.7),.45)*step(hp.y,2.1)*step(.5,pick);
    albedo=mix(albedo,vec3(.36,.28,.20),frame);
  }
  float skirting=(1.-smoothstep(.06,.09,hp.y))*(t==ty?0.:1.);
  albedo=mix(albedo,albedo*.7,skirting);

  // Furniture at mid depth adds parallax between the back wall and the window.
  float zf=D*(office>.5?.38:.55);
  float tf=zf/safe.z;
  if(tf<t){
    vec3 fp=p0+d*tf;
    float x=fp.x/W;
    float body=0.;vec3 piece=vec3(0.);
    if(office>.5){
      float desk=step(fp.y,.76)*step(.70,fp.y)+step(fp.y,.70)*step(abs(fract(fp.x*.55+pick)-.5),.03);
      float screen=step(.80,fp.y)*step(fp.y,1.18)*step(abs(fract(fp.x*.55+pick)-.5),.17);
      float chair=step(fp.y,1.05)*step(.45,fp.y)*step(abs(fract(fp.x*.55+pick+.5)-.5),.09);
      body=max(desk,screen);
      piece=mix(vec3(.55,.52,.48),vec3(.05,.06,.07),screen);
      emissive+=screen*.25*(1.-desk);
    }else{
      float table=step(abs(x-.35-pick*.3),.16)*(step(abs(fp.y-.74),.03)+step(fp.y,.72)*step(.13,abs(x-.35-pick*.3)));
      float chair=step(abs(x-.62+pick2*.2),.05)*step(fp.y,.95)*step(.4,pick2);
      float plant=step(length(vec2((x-.88+pick3*.05)*W,fp.y-.85)*vec2(1.,.8)),.32);
      body=max(max(table,chair),plant*step(.5,pick3));
      piece=mix(vec3(.30,.20,.12),vec3(.20,.32,.16),plant*step(.5,pick3));
    }
    if(body>.5){albedo=piece;normal=vec3(0.,0.,-1.);hp=fp;t=tf;}
  }

  // Lighting: daylight from the window falls off with depth, plus lamps and a sun patch.
  vec3 daylight=(uAmbSun+uAmbAnti+uAmbUp)*.55;
  float falloff=exp(-hp.z/(office>.5?5.:3.2));
  vec3 E=daylight*(.18+1.6*falloff)*(.75+.25*max(normal.y,0.));
  float lightsOn=office>.5?step(.18,pick3):step(.62,pick3);
  E+=vec3(1.,.86,.68)*lightsOn*(office>.5?.10:.07)*(.6+.4*smoothstep(0.,1.,-normal.y*.5+.5));
  if(normal.y>.5&&sunLocal.z<-.05&&sunLocal.y>0.){
    float back=hp.z/(-sunLocal.z);
    vec3 q=hp+sunLocal*back;
    float cellX=fract(q.x/size.x),cellY=q.y/H;
    float through=step(opening.x,cellX)*step(cellX,1.-opening.x)*step(opening.y,cellY)*step(cellY,opening.z);
    E+=uSunColor*sunLocal.y*through*.85;
  }
  vec3 radiance=albedo*E/PI*2.2+emissive*vec3(1.,.95,.86)*.05;

  // Curtains and blinds just behind the glass.
  float zc=.10,tc=zc/safe.z;
  vec3 cp=p0+d*tc;
  float cx=fract(cp.x/size.x),cy=cp.y/H;
  if(office>.5){
    float blind=step(.45,pick2);
    float low=mix(opening.z,opening.y+.15,pick*blind);
    float slat=step(low,cy)*step(.3,fract(cy*H*14.));
    curtainCover=slat*blind;
    radiance=mix(radiance,vec3(.70,.70,.68)*daylight*.9,curtainCover);
  }else{
    float width=mix(.12,.42,pick2);
    float folds=.75+.25*sin(cp.x*38.+pick*6.);
    float drape=step(cx,opening.x+width*.5)+step(1.-opening.x-width*.5,cx);
    float sheer=step(.7,pick)*.55;
    vec3 fabric=mix(vec3(.82,.78,.70),mix(vec3(.55,.30,.25),vec3(.30,.38,.45),pick3),step(.4,pick2));
    curtainCover=max(min(drape,1.)*folds,sheer);
    radiance=mix(radiance,fabric*daylight*(.9+.4*folds),curtainCover);
  }
  return radiance;
}
`;
