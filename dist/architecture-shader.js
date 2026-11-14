import {CERAMIC_SHELL,MATERIAL_SIZE,materialLayers,surfaceProfiles} from './architecture-materials.js';

export const architectureShader=`
const int surfaceMap[${materialLayers.length}]=int[](${materialLayers.join(',')});
const vec3 surfaceScale[${surfaceProfiles.length}]=vec3[](${surfaceProfiles.map(({width,height,relief})=>
  `vec3(${width.toFixed(3)},${height.toFixed(3)},${relief.toFixed(4)})`).join(',')});

vec3 facadeMaterial(vec3 base,inout vec3 normal,int mat,int era,float footprint,out float roughness){
  roughness=.70;
  int layer=mat>=0&&mat<${materialLayers.length}?surfaceMap[mat]:-1;
  if(mat==5&&era>=4)layer=4;
  if(uMaterialDetail<.5||layer<0)return base;
  vec3 scale=surfaceScale[layer];
  bool ground=abs(normal.y)>.63||mat==1||mat==2||mat==9||(mat>=26&&mat<29);
  vec3 tangent=ground?vec3(1.,0.,0.):normalize(vec3(normal.z,0.,-normal.x));
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
    normal=normalize(normal-tangent*tilt.x-up*tilt.y);
  }
  roughness=clamp(texel.b,.19,.97);
  float warmth=(texel.a-.5)*.20;
  return base*(.51+texel.r*.94)*vec3(1.+warmth,1.+warmth*.14,1.-warmth*.76);
}

vec3 windowEnvironment(vec3 ray){
  vec3 reflected=sky(ray,uSun,uHorizon,uZenith,uNight);
  float heading=atan(ray.x,ray.z)*8.28;
  float building=hash(vec2(floor(heading),14.));
  float roof=mix(.018,.173,building*building);
  float edge=1.-smoothstep(roof-.022,roof+.015,ray.y);
  float gap=smoothstep(.045,.14,min(fract(heading),1.-fract(heading)));
  float street=1.-smoothstep(-.44,-.012,ray.y);
  vec3 block=mix(uHorizon,vec3(.19,.24,.28),.65)*(1.-uNight*.55);
  vec3 ground=mix(vec3(.37,.40,.38),vec3(.035,.046,.064),uNight);
  return mix(mix(reflected,block,edge*gap*.57),ground,street*.83);
}

vec3 roomBehindGlass(vec3 normal,vec3 view,vec3 tint){
  vec2 uv=localPos.xy/max(extent.xy,vec2(.06))+.5;
  vec3 direction=refract(-view,normal,.76);
  vec3 across=normalize(vec3(normal.z,0.,-normal.x)+vec3(.00001,0.,0.));
  vec2 shift=vec2(dot(direction,across),direction.y)/max(.30,abs(dot(direction,normal)));
  vec2 rear=uv+shift*vec2(.42,.38);
  vec2 outside=abs(rear-.5);
  float room=hash(floor(center.xz*6.)+floor(center.y*4.));
  float ceiling=smoothstep(.70,.98,rear.y);
  float side=smoothstep(.40,.64,max(outside.x,outside.y));
  float furniture=(1.-smoothstep(.15,.22,rear.y))*
    smoothstep(.07,.14,rear.x)*(1.-smoothstep(.67,.95,rear.x));
  float lamp=(1.-smoothstep(.035,.091,length((rear-vec2(.53,.78))*vec2(1.,1.4))));
  vec3 interior=mix(vec3(.24,.25,.24),vec3(.55,.46,.35),room);
  float curtain=smoothstep(.38,.45,outside.x)*(1.-smoothstep(.68,.80,room));
  interior*=.80+.20*ceiling-.23*side-.31*furniture;
  interior=mix(interior,vec3(.51,.49,.41)*(.72+.24*ceiling),curtain*.76);
  float occupied=smoothstep(.65,.73,room)*uNight;
  vec3 reflected=windowEnvironment(reflect(-view,normal));
  float fresnel=.13+.77*pow(1.-max(dot(normal,view),0.),3.);
  vec3 inside=mix(interior*(.89-.67*uNight)+tint*.21,
    interior*vec3(1.55,1.22,.87)+lamp*vec3(.9,.72,.39),occupied);
  return mix(inside,reflected,fresnel+.22*(1.-uNight));
}
`;
