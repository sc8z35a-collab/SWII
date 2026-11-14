import {toGlobal} from '../dist/geography.js';
import {cities} from '../dist/world.js';

export const pedestrianCounts={tokyo:20,paris:15,newyork:20,cairo:15,sydney:15,rio:15};
export function makePedestrians(routes,{heightAt,blocked,inWater,roadMask}){
  const people=[];
  for(const [city,count] of Object.entries(pedestrianCounts)){
    const definition=cities.find(c=>c.id===city),spawn=toGlobal(city,...definition.spawn),candidates=[];
    for(const route of routes.filter(r=>r.id===city&&!r.portal&&r.surface.walk&&
      (r.local||r.points.some(([x,z])=>Math.hypot(x-spawn[0],z-spawn[1])<475)))){
      for(const side of [-1,1]){
        let run=[];
        const finish=()=>{
          if(run.length>12){
            let length=0;
            for(let i=1;i<run.length;i++)length+=Math.hypot(run[i][0]-run[i-1][0],run[i][2]-run[i-1][2]);
            if(length>=28){
              const distance=Math.min(...run.map(p=>Math.hypot(p[0]-spawn[0],p[2]-spawn[1])));
              candidates.push({path:run,length,distance,side,route});
            }
          }
          run=[];
        };
        for(let i=1;i<route.points.length-1;i++){
          const p=route.points[i],a=route.points[i-1],b=route.points[i+1];
          const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
          const offset=(route.width*.5+.64)*side;
          const x=p[0]-dz/len*offset,z=p[1]+dx/len*offset;
          const old=run.at(-1),distance=old?Math.hypot(x-old[0],z-old[2]):0;
          const n=Math.max(1,Math.ceil(distance/.75));
          const points=Array.from({length:n},(_,j)=>{
            const t=(j+1)/n,px=old?old[0]+(x-old[0])*t:x,pz=old?old[2]+(z-old[2])*t:z;
            const curb=roadMask.contains(px,pz)?.125:.205;
            return [px,heightAt(px,pz)+curb,pz];
          });
          const safe=points.every(([x,y,z],j)=>{
            const prior=points[j-1]??old;
            return !inWater(x,z)&&!blocked(x,z)&&!blocked(x+.29,z)&&!blocked(x-.29,z)&&
              !blocked(x,z+.29)&&!blocked(x,z-.29)&&(!prior||Math.abs(y-prior[1])<.39);
          });
          if(!safe){finish();continue;}
          run.push(...points);
          if(run.length>100)finish();
        }
        finish();
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const chosen=[];
    for(let n=0;n<count;n++){
      const candidate=candidates.find(c=>!chosen.includes(c)&&chosen.every(other=>other.side!==c.side||other.route!==c.route))??
        candidates.find(c=>!chosen.includes(c))??candidates[n%candidates.length];
      if(!candidate)throw Error('No pedestrian sidewalk in '+city);
      chosen.push(candidate);
      people.push({id:people.length,city,speed:1.05+(people.length%5)*.087,phase:.21+people.length*.173,path:candidate.path});
    }
  }
  return people;
}
