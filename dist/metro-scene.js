import {metroLegs,stations,railPose,platformY,trackY,hallLength} from './metro.js';
import {distanceToBounds,skylineBatches} from './mesh-batches.js';
import {meshFrame,meshTriangle} from './moving-models.js';

export const undergroundLight={
  horizon:[.075,.091,.094],zenith:[.092,.113,.118],sun:[.12,.976,.18],night:.20,haze:.0075,ocean:0
};
const stationHalf=hallLength*.5;
let batches;
function createMetroScene(){
  const meshes={};
  const quad=(a,b,c,d,paint,material)=>{
    meshTriangle(meshes,a,c,b,paint,material);meshTriangle(meshes,a,d,c,paint,material);
  };
  function section(leg,d){
    const pose=railPose(leg,d),s=Math.min(d,leg.length-d);
    const expansion=Math.max(0,Math.min(1,(stationHalf+6-s)/6));
    return {width:2.38+5.75*expansion,roof:trackY+5.25+.65*expansion,
      point:(across,y)=>[pose.x-pose.dz*across,y,pose.z+pose.dx*across]};
  }
  for(const leg of metroLegs){
    const count=Math.ceil((leg.length-2*stationHalf)/9);
    const cuts=[0,stationHalf,stationHalf+6,...Array.from({length:count-1},(_,i)=>
      stationHalf+6+(leg.length-2*stationHalf-12)*(i+1)/count),leg.length-stationHalf-6,leg.length-stationHalf,leg.length];
    for(let i=1;i<cuts.length;i++){
      const first=cuts[i-1],last=cuts[i],a=section(leg,first),b=section(leg,last);
      const l=-2.38,r0=a.width,r1=b.width,floor=trackY-.18;
      quad(a.point(l,floor),b.point(l,floor),b.point(r1,floor),a.point(r0,floor),'565956',12);
      quad(a.point(r0,a.roof),b.point(r1,b.roof),b.point(l,b.roof),a.point(l,a.roof),'888984',12);
      quad(a.point(l,floor),a.point(l,a.roof),b.point(l,b.roof),b.point(l,floor),'8a8c86',12);
      quad(a.point(r0,floor),b.point(r1,floor),b.point(r1,b.roof),a.point(r0,a.roof),'8c9189',12);
      for(const side of [-.745,.745]){
        quad(a.point(side-.037,trackY+.096),b.point(side-.037,trackY+.096),
          b.point(side+.037,trackY+.096),a.point(side+.037,trackY+.096),'9caaa9',25);
      }
      const {part}=meshFrame(meshes,railPose(leg,(first+last)*.5));
      // The track bed: ballast and sleepers come from the track photo along the rails.
      part('box',0,.035,0,2.4,.05,last-first+.04,'5e5d58',12);
      part('box',-1.56,4.92,0,.13,.073,Math.min(4,last-first),'ede0b9',7);
      part('box',-2.24,1.15,0,.08,.063,last-first+.05,'636e66',25);
    }

  }
  for(const station of stations){
    const [dx,dz]=station.tangent,yaw=Math.atan2(dx,-dz);
    const {part}=meshFrame(meshes,{x:station.x,y:platformY,z:station.z,yaw});
    part('box',4.95,-.66,0,6.20,1.32,hallLength,'9f9b90',23);
    part('box',2.027,.027,0,.24,.053,hallLength-.18,'c7ae69',1);
    part('box',7.68,.045,0,.33,.096,hallLength-.18,'759388',23);
    for(let n=-45;n<=45;n+=9){
      part('box',6.87,2.29,n,.43,4.58,.52,'b3b1a8',18);
      part('box',4.96,4.42,n,3.95,.11,.51,'a6aaa4',25);
      part('box',4.96,4.328,n,3.70,.10,.33,'f3e6c4',7);
      part('box',7.61,2.41,n+.87,.25,1.25,4.50,'63857a',25);
      part('box',7.45,2.76,n+.87,.094,.37,4.18,'d8ddc7',7);
      if(n%18===0){
        part('box',6.40,.48,n+.87,1.02,.19,2.88,'6b8275',24);
        part('box',6.82,.87,n+.87,.14,.62,2.88,'647e70',24);
      }
    }
    for(const end of [-1,1]){
      part('box',5.13,1.44,end*(stationHalf-.18),5.80,2.88,.24,'8a9790',12);
      part('box',3.18,2.34,end*(stationHalf-.34),1.82,.34,.18,'b2c8aa',7);
    }
  }
  return skylineBatches(meshes);
}
export function metroBatches(x,z){
  batches??=createMetroScene();
  return batches.filter(batch=>distanceToBounds(batch.bounds,x,z)<235**2);
}
