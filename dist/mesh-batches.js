import {toTile} from './geography.js';
import {DETAIL_FLAG} from './facade-look.js';

// Draw opaque buildings before terrain so the depth buffer rejects hidden ground fragments.
const drawOrder=['box','chamfer','taper','roof','window','tube','cone','pyramid','ball','tri','pane'];
const emptyBounds=()=>[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];

function includeInstance(bounds,kind,source,offset){
  for(let axis=0;axis<3;axis++){
    const center=source[offset+axis];
    const first=source[offset+3+axis],last=source[offset+9+axis];
    let low,high;
    if(kind==='tri'){
      low=center+Math.min(0,first,last);
      high=center+Math.max(0,first,last);
    }else{
      const half=(Math.abs(first)+Math.abs(source[offset+6+axis])+Math.abs(last))*.5;
      low=center-half;
      high=center+half;
    }
    bounds[axis]=Math.min(bounds[axis],low-.01);
    bounds[axis+3]=Math.max(bounds[axis+3],high+.01);
  }
}

export function meshBatch(meshes,terrain){
  const size=drawOrder.reduce((n,kind)=>n+(meshes[kind]?.length??0),terrain?.length??0);
  const data=new Float32Array(size),bounds=emptyBounds(),ranges=[];
  let offset=0;
  for(const kind of drawOrder){
    const sources=kind==='tri'&&terrain?[terrain,meshes.tri]:[meshes[kind]];
    let length=0,details=0;
    for(const source of sources){
      if(!source)continue;
      length+=source.length;
      for(let i=15;i<source.length;i+=16)if(source[i]%1>=DETAIL_FLAG)details+=16;
    }
    const baseLength=length-details;
    const baseBounds=emptyBounds(),detailBounds=emptyBounds();
    let baseAt=offset,detailAt=offset+baseLength;
    for(const source of sources){
      if(!source)continue;
      for(let i=0;i<source.length;i+=16){
        const detail=source[i+15]%1>=DETAIL_FLAG;
        const at=detail?detailAt:baseAt;
        for(let n=0;n<16;n++)data[at+n]=source[i+n];
        includeInstance(detail?detailBounds:baseBounds,kind,source,i);
        if(detail)detailAt+=16;else baseAt+=16;
      }
    }
    if(baseLength)ranges.push({kind,start:offset,count:baseLength/16,bounds:baseBounds,detail:false});
    if(details)ranges.push({kind,start:offset+baseLength,count:details/16,bounds:detailBounds,detail:true});
    offset+=length;
  }
  for(const range of ranges)for(let axis=0;axis<3;axis++){
    bounds[axis]=Math.min(bounds[axis],range.bounds[axis]);
    bounds[axis+3]=Math.max(bounds[axis+3],range.bounds[axis+3]);
  }
  return {data,bounds,ranges};
}

export function skylineBatches(meshes){
  const tiles=new Map();
  for(const kind of drawOrder){
    const data=meshes[kind]??[];
    for(let i=0;i<data.length;i+=16){
      const key=toTile(data[i],data[i+2]).join(':');
      if(!tiles.has(key))tiles.set(key,{});
      const tile=tiles.get(key);
      (tile[kind]??=[]).push(...data.slice(i,i+16));
    }
  }
  return [...tiles.values()].map(meshes=>meshBatch(meshes));
}

export function distanceToBounds(bounds,x,z){
  const dx=Math.max(bounds[0]-x,0,x-bounds[3]);
  const dz=Math.max(bounds[2]-z,0,z-bounds[5]);
  return dx*dx+dz*dz;
}

export function frustumPlanes(matrix){
  const planes=[];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    planes.push([matrix[3]+sign*matrix[axis],matrix[7]+sign*matrix[4+axis],
      matrix[11]+sign*matrix[8+axis],matrix[15]+sign*matrix[12+axis]]);
  }
  return planes;
}

export function inFrustum(bounds,planes){
  for(const [x,y,z,w] of planes){
    if(x*bounds[x>=0?3:0]+y*bounds[y>=0?4:1]+z*bounds[z>=0?5:2]+w<0)return false;
  }
  return true;
}

export function glassOrder(batches,planes,eye,forward,detailRadius){
  const panes=[];
  for(const {data,ranges} of batches){
    for(const range of ranges){
      if(range.kind!=='pane'||!inFrustum(range.bounds,planes)||
        range.detail&&distanceToBounds(range.bounds,eye[0],eye[2])>detailRadius**2)continue;
      const end=range.start+range.count*16;
      for(let offset=range.start;offset<end;offset+=16){
        const depth=(data[offset]-eye[0])*forward[0]+(data[offset+1]-eye[1])*forward[1]+(data[offset+2]-eye[2])*forward[2];
        panes.push({data,offset,depth});
      }
    }
  }
  return panes.sort((a,b)=>b.depth-a.depth);
}
