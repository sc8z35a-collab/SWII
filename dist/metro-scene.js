import {metroLegs,railPose,platformY,trackY,hallLength} from './metro.js';
import {distanceToBounds,skylineBatches} from './mesh-batches.js';
import {metroMaterial as m,metroQuad} from './metro-materials.js';

export const undergroundLight={
  horizon:[.075,.091,.094],zenith:[.092,.113,.118],sun:[.12,.976,.18],night:.20,haze:.0075,ocean:0
};
const stationHalf=hallLength*.5,platformEdge=1.85;
let batches;
function createMetroScene(){
  const meshes={};
  for(const leg of metroLegs){
    const section=(d)=>{
      const pose=railPose(leg,d),s=Math.min(d,leg.length-d);
      const expansion=Math.max(0,Math.min(1,(stationHalf+6-s)/6));
      return {width:2.38+5.75*expansion,roof:trackY+5.25+.65*expansion,pose,
        point:(across,y)=>[pose.x-pose.dz*across,y,pose.z+pose.dx*across]};
    };
    const draw=(first,last,a,b)=>{
      const length=last-first,middle=(first+last)*.5,c=section(middle);
      if(length>8&&Math.hypot(c.pose.x-(a.pose.x+b.pose.x)*.5,c.pose.z-(a.pose.z+b.pose.z)*.5)>.24){
        draw(first,middle,a,c);draw(middle,last,c,b);
        return;
      }
      const hall=Math.min(middle,leg.length-middle)<stationHalf;
      const floor=trackY-.18,l=-2.38;
      const ground=(leftA,leftB,rightA,rightB,yA,yB,material,tileLength,flip)=>metroQuad(meshes,
        [b.point(leftB,yB),b.point(rightB,yB),a.point(rightA,yA),a.point(leftA,yA)],material,{v:length/tileLength,flip});
      const wall=(xA,xB,lowA,lowB,highA,highB,material,flip)=>metroQuad(meshes,
        [a.point(xA,highA),b.point(xB,highB),b.point(xB,lowB),a.point(xA,lowA)],material,{u:length/8,flip});
      ground(l,l,a.width,b.width,floor,floor,m.walkway,6,true);
      ground(-1.28,-1.28,1.28,1.28,trackY+.045,trackY+.045,m.track,5,true);
      ground(l,l,hall?platformEdge:a.width,hall?platformEdge:b.width,a.roof,b.roof,m.tunnelCeiling,10,false);
      wall(l,l,floor,floor,a.roof,b.roof,m.tunnelWall,true);
      wall(a.width,b.width,hall?platformY:floor,hall?platformY:floor,a.roof,b.roof,
        hall?m.platformWall:m.tunnelWall,false);
      if(hall){
        ground(platformEdge,platformEdge,a.width,b.width,platformY,platformY,m.platformFloor,7,true);
        ground(platformEdge,platformEdge,a.width,b.width,a.roof,b.roof,m.platformCeiling,8,false);
        wall(platformEdge,platformEdge,floor,floor,platformY,platformY,m.platformEdge,false);
      }
    };
    const cuts=[0,stationHalf,stationHalf+6];
    for(let d=stationHalf+36;d<leg.length-stationHalf-6;d+=30)cuts.push(d);
    cuts.push(leg.length-stationHalf-6,leg.length-stationHalf,leg.length);
    // Split long platform runs as well so their lighting and station wall repeat at a consistent size.
    for(let i=1;i<cuts.length;i++){
      const count=Math.ceil((cuts[i]-cuts[i-1])/30);
      for(let j=0;j<count;j++){
        const first=cuts[i-1]+(cuts[i]-cuts[i-1])*j/count,last=cuts[i-1]+(cuts[i]-cuts[i-1])*(j+1)/count;
        draw(first,last,section(first),section(last));
      }
    }
    for(const end of [stationHalf,leg.length-stationHalf]){
      const a=section(end);
      metroQuad(meshes,[a.point(platformEdge+.05,a.roof),a.point(a.width,a.roof),
        a.point(a.width,platformY),a.point(platformEdge+.05,platformY)],m.platformEnd,{flip:end<leg.length*.5});
    }
  }
  return skylineBatches(meshes);
}
export function metroBatches(x,z){
  batches??=createMetroScene();
  return batches.filter(batch=>distanceToBounds(batch.bounds,x,z)<235**2);
}
