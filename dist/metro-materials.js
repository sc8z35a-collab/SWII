// Atlas cell order. Each surface has a flat fallback so the reduced meshes work without the sheets.
export const METRO_MATERIAL_BASE=224;
export const METRO_PALETTE=[
  'a5afb0','668a88','657e83','8a9596','333b3d','646e69','597a73','b7bcb0','778f8d',
  '555651','697571','858984','a4a696','858f87','65837a','adad9f','788781','525f5a'
];
export const metroMaterial={
  trainSide:224,trainDoor:225,trainCab:226,trainRoof:227,trainBogie:228,trainFloor:229,
  trainWall:230,trainCeiling:231,trainEnd:232,track:233,tunnelWall:234,tunnelCeiling:235,
  platformFloor:236,platformEdge:237,platformWall:238,platformCeiling:239,platformEnd:240,walkway:241
};
export const METRO_COLUMN=110;
// A fractional material selects the alternate sheet without adding a draw call.
export const TRAIN_VARIANT=.125;
export const metroSheets=[
  {file:'metro-train.webp',slots:Object.keys(metroMaterial).slice(0,9).map(id=>({id,uses:['metro:'+id]}))},
  {file:'metro-station.webp',slots:Object.keys(metroMaterial).slice(9).map(id=>({id,uses:['metro:'+id]}))},
  {file:'metro-train-worn.webp',slots:Object.keys(metroMaterial).slice(0,9).map(id=>({id:id+'-worn',uses:['metro:'+id]}))}
];

const position=(a,b)=>b.map((n,i)=>n-a[i]);
export const isMetroMaterial=mat=>mat>=METRO_MATERIAL_BASE&&mat<METRO_MATERIAL_BASE+METRO_PALETTE.length;
export const metroUv=value=>[(value%4096)/256,Math.floor(value/4096)/256];
const uv=(u,v)=>Math.round(u*256)+4096*Math.round(v*256);
export function metroQuad(meshes,[a,b,c,d],material,{u=1,v=1,flip=false}={}){
  const points=[a,b,c,d],atlas=[uv(0,0),uv(u,0),uv(u,v),uv(0,v)];
  const data=meshes.tri??=[];
  for(const [i,j,k] of flip?[[0,2,1],[0,3,2]]:[[0,1,2],[0,2,3]]){
    const p=points[i],x=position(p,points[j]),z=position(p,points[k]);
    const normal=[x[1]*z[2]-x[2]*z[1],x[2]*z[0]-x[0]*z[2],x[0]*z[1]-x[1]*z[0]];
    const length=Math.hypot(...normal);
    if(length<1e-5)continue;
    data.push(...p,...x,...normal.map(n=>n/length),...z,atlas[i],atlas[j],atlas[k],material);
  }
}
