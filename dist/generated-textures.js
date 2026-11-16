// Image-generated surface textures made by the gpt-image-textures skill. Each sheet is a WebP atlas
// with a 3x3 grid of seamless textures, and materials/generated/manifest.json lists which world
// materials use them. Without a manifest the procedural surfaces are used as before.
export const PHOTO_TABLE_WIDTH=128,PHOTO_TABLE_ROWS=4,PHOTO_MATERIALS=64,PHOTO_VARIANTS=8;

// The lookup table read by the world shader (see photoLayer in architecture-shader.js):
// rows 0-1, column = material id: up to eight layer indices (-1 = none);
// row 2, column = layer: width and height in meters, tint, mean linear luminance;
// row 3, column = layer: roughness, relief in meters.
export function buildPhotoTable(manifest){
  const table=new Float32Array(PHOTO_TABLE_WIDTH*PHOTO_TABLE_ROWS*4);
  for(let m=0;m<PHOTO_MATERIALS;m++)for(let k=0;k<PHOTO_VARIANTS;k++)
    table[((k>>2)*PHOTO_TABLE_WIDTH+m)*4+(k&3)]=-1;
  const slots=[],used=new Array(PHOTO_MATERIALS).fill(0);
  for(const sheet of manifest?.sheets??[])for(const [cell,slot] of (sheet.slots??[]).entries()){
    const layer=slots.length;
    if(layer>=PHOTO_TABLE_WIDTH)break;
    slots.push({sheet:sheet.file,cell,id:slot.id});
    const at=(row,i)=>(row*PHOTO_TABLE_WIDTH+layer)*4+i;
    // size: the tile's width and height in meters after cutting; older manifests give meters only.
    const meters=Number(slot.meters)>0?Number(slot.meters):2;
    const [width,height]=Array.isArray(slot.size)&&slot.size.every(n=>Number(n)>0)?slot.size.map(Number):[meters,meters];
    table[at(2,0)]=width;table[at(2,1)]=height;
    table[at(2,2)]=Math.min(1,Math.max(0,Number(slot.tint)||0));
    table[at(2,3)]=Math.max(.005,Number(slot.luma)||.18);
    table[at(3,0)]=Math.min(.97,Math.max(.05,Number(slot.roughness)||.7));
    table[at(3,1)]=Math.max(0,Number(slot.relief)||0);
    for(const material of slot.materials??[]){
      if(!Number.isInteger(material)||material<0||material>=PHOTO_MATERIALS||used[material]>=PHOTO_VARIANTS)continue;
      const k=used[material]++;
      table[((k>>2)*PHOTO_TABLE_WIDTH+material)*4+(k&3)]=layer;
    }
  }
  return {table,slots};
}

// Cuts a cell out of an atlas at the requested size. createImageBitmap does it in one step where
// its crop and resize options work; otherwise the cell is drawn through a canvas.
async function cutCell(atlas,cell,grid,tile){
  const size=atlas.width/grid,x=(cell%grid)*size,y=Math.floor(cell/grid)*size;
  try{
    const bitmap=await createImageBitmap(atlas,x,y,size,size,{resizeWidth:tile,resizeHeight:tile,resizeQuality:'high'});
    if(bitmap.width===tile&&bitmap.height===tile)return bitmap;
    bitmap.close?.();
  }catch{}
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(tile,tile):Object.assign(document.createElement('canvas'),{width:tile,height:tile});
  const context=canvas.getContext('2d');
  context.imageSmoothingQuality='high';
  context.drawImage(atlas,x,y,size,size,0,0,tile,tile);
  return createImageBitmap(canvas);
}

// Returns {tile, layers, table, count} for renderer.setPhotoTextures, or null when no textures have
// been generated or the browser cannot decode them.
export async function loadGeneratedTextures({tile=384,signal}={}){
  const base=new URL('./materials/generated/',import.meta.url);
  let manifest;
  try{
    const response=await fetch(new URL('manifest.json',base),{signal,cache:'no-cache'});
    if(!response.ok)return null;
    manifest=await response.json();
  }catch{return null;}
  if(manifest?.version!==1||!Array.isArray(manifest.sheets)||!manifest.sheets.length)return null;
  if(typeof createImageBitmap!=='function')return null;
  const {table,slots}=buildPhotoTable(manifest);
  const grid=manifest.grid??3,layers=[];
  const atlases=new Map();
  try{
    for(const sheet of manifest.sheets){
      const response=await fetch(new URL(sheet.file,base),{signal});
      if(!response.ok)throw Error('Missing texture sheet '+sheet.file);
      atlases.set(sheet.file,await createImageBitmap(await response.blob()));
    }
    for(const slot of slots)layers.push(await cutCell(atlases.get(slot.sheet),slot.cell,grid,tile));
  }catch(error){
    for(const layer of layers)layer.close?.();
    console.info('Generated textures unavailable',error.message);
    return null;
  }finally{
    for(const atlas of atlases.values())atlas.close?.();
  }
  return {tile,layers,table,count:layers.length};
}
