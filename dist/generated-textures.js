import {METRO_COLUMN,metroMaterial,metroSheets} from './metro-materials.js';
// Image-generated surface textures made by the gpt-image-textures skill. Each sheet is a WebP atlas
// with a 3x3 grid of seamless textures, and materials/generated/manifest.json lists which world
// materials use them. Without a manifest the procedural surfaces are used as before.
export const PHOTO_TABLE_WIDTH=256,PHOTO_TABLE_ROWS=4,PHOTO_MATERIALS=64,PHOTO_VARIANTS=8;
// Pictures hung in rooms are listed under four extra columns (up to 32), floor rugs under one more.
export const ART_COLUMN=64,ART_GROUPS=4,RUG_COLUMN=68,CURTAIN_COLUMN=69,BLINDS_COLUMN=70;
// Special places (catalog "uses", or an "art" kind) and, from column 128, the surfaces of furnished
// rooms by material id (catalog "rooms").
export const PLACE_COLUMNS={rug:68,curtain:69,blinds:70,bark:71,ceiling:72,'office-floor':73,tactile:74,curb:75,'flat-roof':76,platform:77,
  'tower-red':78,'tower-white':79,'vermilion':80,'warning':81,'rust-concrete':82,'track':83,'tunnel-lining':84,'runway':85,'runway-marks':86,'pole':87,'guardrail':88,'manhole':89,'train-body':90,'train-seat':91,'car-paint':92,'tire':93,'car-seat':94,'car-trim':95,'chrome':96,'headlight':97,'fabric-top':98,'fabric-bottom':99,'shoe':100,'skin':101,'hair':102,'glass-distant':103,'frosted':104,'smoke':105,'fire':106,'dust':107,'sparks':108,'ripples':109,...Object.fromEntries(Object.keys(metroMaterial).map((id,i)=>['metro:'+id,METRO_COLUMN+i]))};
export const ROOM_COLUMN=128;
const LAST_COLUMN=ROOM_COLUMN+PHOTO_MATERIALS-1;

// The lookup table read by the world shader (see photoLayer in architecture-shader.js):
// rows 0-1, column = material id: up to eight layer indices (-1 = none); columns 64-67 list the
// pictures for rooms, 68-76 the special places in PLACE_COLUMNS, and 128 + material id the
// surfaces of furnished rooms;
// row 2, column = layer: width and height in meters, tint, mean linear luminance;
// row 3, column = layer: roughness, relief in meters.
export function buildPhotoTable(manifest){
  const table=new Float32Array(PHOTO_TABLE_WIDTH*PHOTO_TABLE_ROWS*4);
  for(let m=0;m<=LAST_COLUMN;m++)for(let k=0;k<PHOTO_VARIANTS;k++)
    table[((k>>2)*PHOTO_TABLE_WIDTH+m)*4+(k&3)]=-1;
  const slots=[],used=new Array(LAST_COLUMN+1).fill(0);
  const list=(column,layer)=>{
    if(used[column]>=PHOTO_VARIANTS)return false;
    const k=used[column]++;
    table[((k>>2)*PHOTO_TABLE_WIDTH+column)*4+(k&3)]=layer;
    return true;
  };
  let pictures=0;
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
    for(const place of [slot.art,...(slot.uses??[])])if(PLACE_COLUMNS[place])list(PLACE_COLUMNS[place],layer);
    for(const material of slot.rooms??[])
      if(Number.isInteger(material)&&material>=0&&material<PHOTO_MATERIALS)list(ROOM_COLUMN+material,layer);
    if(slot.art===true){
      for(let g=0;g<ART_GROUPS&&!list(ART_COLUMN+(pictures+g)%ART_GROUPS,layer);g++);
      pictures++;
    }
    for(const material of slot.materials??[])
      if(Number.isInteger(material)&&material>=0&&material<PHOTO_MATERIALS)list(material,layer);
  }
  return {table,slots};
}

// Cuts a cell out of an atlas at the requested size. createImageBitmap does it in one step where
// its crop and resize options work; otherwise the cell is drawn through a canvas.
async function cutCell(atlas,cell,grid,tile){
  const size=atlas.width/grid,col=cell%grid,row=Math.floor(cell/grid);
  const x=Math.round(col*size),y=Math.round(row*size);
  const width=Math.round((col+1)*size)-x,height=Math.round((row+1)*size)-y;
  try{
    const bitmap=await createImageBitmap(atlas,x,y,width,height,{resizeWidth:tile,resizeHeight:tile,resizeQuality:'high'});
    if(bitmap.width===tile&&bitmap.height===tile)return bitmap;
    bitmap.close?.();
  }catch{}
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(tile,tile):Object.assign(document.createElement('canvas'),{width:tile,height:tile});
  const context=canvas.getContext('2d');
  context.imageSmoothingQuality='high';
  context.drawImage(atlas,x,y,width,height,0,0,tile,tile);
  return createImageBitmap(canvas);
}

// Returns {tile, layers, table, count} for renderer.setPhotoTextures, or null when no textures have
// been generated or the browser cannot decode them.
export async function loadGeneratedTextures({tile=384,signal,metroOnly=false}={}){
  const base=new URL('./materials/generated/',import.meta.url);
  let manifest={version:1,grid:3,sheets:[]};
  if(!metroOnly)try{
    const response=await fetch(new URL('manifest.json',base),{signal,cache:'no-cache'});
    if(!response.ok)return null;
    manifest=await response.json();
  }catch{return null;}
  if(manifest?.version!==1||!Array.isArray(manifest.sheets))return null;
  if(typeof createImageBitmap!=='function')return null;
  const layers=[],sheets=[];
  const sources=[...manifest.sheets,...metroSheets];
  async function readSheet(sheet,optional){
    const cells=[];
    let atlas;
    try{
      const response=await fetch(new URL(sheet.file,base),{signal});
      if(!response.ok)throw Error('Missing texture sheet '+sheet.file);
      atlas=await createImageBitmap(await response.blob());
      const grid=optional?3:manifest.grid??3;
      if(atlas.width!==atlas.height||atlas.width<grid)throw Error('Invalid atlas '+sheet.file);
      for(let cell=0;cell<(sheet.slots?.length??0);cell++){
        signal?.throwIfAborted();
        cells.push(await cutCell(atlas,cell,grid,tile));
      }
      return {sheet,cells};
    }catch(error){
      for(const cell of cells)cell.close?.();
      if(!optional||signal?.aborted)throw error;
      return null;
    }finally{
      atlas?.close?.();
    }
  }
  try{
    // Bound the decoded source images in memory, while overlapping downloads and cutting.
    for(let start=0;start<sources.length&&layers.length<PHOTO_TABLE_WIDTH;start+=2){
      const results=await Promise.allSettled(sources.slice(start,start+2).map((sheet,i)=>
        readSheet(sheet,start+i>=manifest.sheets.length)));
      for(const result of results){
        if(result.status!=='fulfilled'||!result.value)continue;
        const {sheet,cells}=result.value;
        sheets.push(sheet);
        for(const cell of cells){
          if(layers.length<PHOTO_TABLE_WIDTH)layers.push(cell);
          else cell.close?.();
        }
      }
      const failed=results.find(result=>result.status==='rejected');
      if(failed)throw failed.reason;
    }
    const {table}=buildPhotoTable({sheets});
    return layers.length?{tile,layers,table,count:layers.length}:null;
  }catch(error){
    for(const layer of layers)layer.close?.();
    if(!signal?.aborted)console.info('Generated textures unavailable',error.message);
    return null;
  }
}
