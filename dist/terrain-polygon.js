import {GRID_STEP} from './geography.js';

function clip(points,axis,value,greater){
  const out=[];
  const coordinate=p=>axis===2?p[0]+p[1]:p[axis];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=coordinate(a)-value,db=coordinate(b)-value;
    const inside=greater?da>=-1e-7:da<=1e-7,next=greater?db>=-1e-7:db<=1e-7;
    if(inside)out.push(a);
    if(inside!==next){
      const t=da/(da-db);
      out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return out;
}

// Match the elevation grid and its diagonal, so a sloped polygon never spans a terrain crease.
export function* terrainPolygons(points){
  const x0=Math.floor(Math.min(...points.map(p=>p[0]))/GRID_STEP);
  const x1=Math.floor(Math.max(...points.map(p=>p[0]))/GRID_STEP);
  const z0=Math.floor(Math.min(...points.map(p=>p[1]))/GRID_STEP);
  const z1=Math.floor(Math.max(...points.map(p=>p[1]))/GRID_STEP);
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
    let square=clip(points,0,x*GRID_STEP,true);
    square=clip(square,0,(x+1)*GRID_STEP,false);
    square=clip(square,1,z*GRID_STEP,true);
    square=clip(square,1,(z+1)*GRID_STEP,false);
    if(square.length<3)continue;
    for(const greater of [false,true]){
      const polygon=clip(square,2,(x+z+1)*GRID_STEP,greater);
      if(polygon.length>=3)yield polygon;
    }
  }
}
