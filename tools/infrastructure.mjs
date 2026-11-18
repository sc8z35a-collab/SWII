import {toGlobal,liquidAt} from '../dist/geography.js';
import {airport,airportZone,metroStops} from '../dist/transport-layout.js';
import {stationEntry} from '../dist/metro.js';
import {roadTunnels,tunnelPoint,tunnelFloor,tunnelRoof,TUNNEL_ASPHALT} from '../dist/road-tunnels.js';
import {catmull,openTrench} from './layout.mjs';
import {entryFoundation} from './building-sites.mjs';

export const protectedSite=(x,z,margin=0)=>airportZone(x,z,margin)||openTrench(x,z,margin)||
  metroStops.some(stop=>Math.hypot(x-stationEntry(stop)[0],z-stop.z)<6+margin);

export function infrastructureRoads(routes,heightAt){
  const airportRoad={id:'tokyo',width:11.2,main:true,arterial:true,local:false,
    points:catmull([toGlobal('tokyo',-10,122),[-48,1510],[97,1692],[405,1840],[628,1915],[828,1935],airport.entrance],10)};
  const approaches=[];
  for(const tunnel of roadTunnels)for(const side of [1,-1]){
    const distance=side===1?0:tunnel.length,from=tunnelPoint(tunnel,distance),lead=tunnelPoint(tunnel,distance-18*side);
    const candidates=[];
    for(const route of routes)for(const point of route.points){
      const d=Math.hypot(point[0]-lead[0],point[1]-lead[1]);
      if(d<13||d>180||openTrench(...point,8)||airportZone(...point))continue;
      const backwards=((point[0]-lead[0])*tunnel.dx+(point[1]-lead[1])*tunnel.dz)*side;
      if(backwards>12)continue;
      candidates.push({point,score:d+Math.max(0,backwards)*2});
    }
    candidates.sort((a,b)=>a.score-b.score);
    let points;
    for(const {point} of candidates.slice(0,34)){
      const trial=catmull([from,lead,point],5);
      if(trial.every((p,i)=>!liquidAt(...p,heightAt(...p))&&(i<2||!openTrench(...p))&&
        (!i||Math.abs(heightAt(...p)-heightAt(...trial[i-1]))<=Math.hypot(p[0]-trial[i-1][0],p[1]-trial[i-1][1])*.34))){
        points=trial;break;
      }
    }
    if(!points)throw Error('No road approach for '+tunnel.id+' portal '+side);
    approaches.push({id:tunnel.city,width:11.1,main:true,arterial:false,local:true,portal:true,points});
  }
  return [airportRoad,...approaches];
}

function patch(drape,x,z,width,depth,paint,mat=1,offset=.19,clip){
  const a=[x-width/2,0,z-depth/2],b=[x+width/2,0,z-depth/2];
  const c=[x+width/2,0,z+depth/2],d=[x-width/2,0,z+depth/2];
  drape(a,b,c,paint,mat,offset,clip);drape(a,c,d,paint,mat,offset,clip);
}

export function buildRoadTunnels({shape,triangle,heightAt}){
  const box=(...args)=>shape('box',...args);
  for(const tunnel of roadTunnels){
    const {half,ramp,length,dx,dz}=tunnel,angle=Math.atan2(-dz,dx);
    const at=(d,y,side)=>{const [x,z]=tunnelPoint(tunnel,d,side);return [x,y,z];};
    const ends=[0,ramp,length-ramp,length];
    for(let section=1;section<ends.length;section++){
      const first=ends[section-1],last=ends[section],count=Math.ceil((last-first)/4);
      for(let i=0;i<count;i++){
        const a=first+(last-first)*i/count,b=first+(last-first)*(i+1)/count,mid=(a+b)/2;
        const y0=tunnelFloor(tunnel,a),y1=tunnelFloor(tunnel,b),covered=section===2;
        function floor(left,right,paint,mat,lift){
          const p=at(a,y0+lift,left),q=at(a,y0+lift,right),r=at(b,y1+lift,right),s=at(b,y1+lift,left);
          triangle(p,s,q,paint,mat);triangle(q,s,r,paint,mat);
        }
        floor(-half,half,'54595c',TUNNEL_ASPHALT,.025);
        if(i%3!==2)floor(-.074,.074,'d6cba1',0,.044);
        for(const side of [-1,1]){
          const edge=side*half,near=side*(half-.67);
          floor(Math.min(near,edge),Math.max(near,edge),'aaa89b',23,.144);
          const h0=covered?y0+tunnelRoof:Math.max(y0+.38,heightAt(...tunnelPoint(tunnel,a,edge))+.42);
          const h1=covered?y1+tunnelRoof:Math.max(y1+.38,heightAt(...tunnelPoint(tunnel,b,edge))+.42);
          const p=at(a,y0-.16,edge),q=at(b,y1-.16,edge),r=at(b,h1,edge),s=at(a,h0,edge);
          if(side<0){triangle(p,q,s,'a7a49a',12);triangle(s,q,r,'a7a49a',12);}
          else{triangle(p,s,q,'a7a49a',12);triangle(s,r,q,'a7a49a',12);}
          if(!covered){
            const rail=side*(half+.06),h=(h0+h1)*.5;
            box(...at(mid,h-.12,rail),b-a+.04,.22,.27,'a4a49b',18,angle);
          }
        }
        if(covered){
          const roof=(y0+y1)*.5+tunnelRoof;
          box(...at(mid,roof+.19,0),b-a+.05,.38,half*2+.22,'8f8c81',12,angle);
          if(i%3===0)for(const side of [-1,1])
            box(...at(mid,roof-.087,side*2.83),2.8,.12,.22,'f1ddaa',7,angle);
        }
      }
    }
    for(const d of [ramp,length-ramp]){
      const y=tunnelFloor(tunnel,d);
      const fascia=y+tunnelRoof+.39;
      for(let i=0;i<8;i++){
        const a=half*2*(i/8-.5),b=half*2*((i+1)/8-.5);
        const h0=Math.max(fascia,heightAt(...tunnelPoint(tunnel,d,a))+.025);
        const h1=Math.max(fascia,heightAt(...tunnelPoint(tunnel,d,b))+.025);
        const p=at(d,fascia,a),q=at(d,fascia,b),r=at(d,h1,b),s=at(d,h0,a);
        if(d===ramp){triangle(p,q,r,'9e9d91',12);triangle(p,r,s,'9e9d91',12);}
        else{triangle(p,r,q,'9e9d91',12);triangle(p,s,r,'9e9d91',12);}
      }
      box(...at(d,y+tunnelRoof+.4,0),1.22,.89,half*2+1.05,'b0a797',18,angle);
      for(const side of [-1,1]){
        box(...at(d,y+tunnelRoof*.5,side*(half+.16)),.90,tunnelRoof+.55,.72,'b0a797',18,angle);
        box(...at(d,y+2.51,side*(half-.39)),.44,.51,.17,'83b694',7,angle);
      }
    }
  }
}

export function buildTransitSites({drape}){
  for(const stop of metroStops){
    const [x,z]=stationEntry(stop);
    patch(drape,x,z,10.8,8.0,'a5a79a',1,.205,'outside');
    if(stop.id!=='airport')patch(drape,(stop.x+x)*.5,z,Math.abs(x-stop.x),2.45,'adb0a4',1,.189,'outside');
  }
  const {west,east,north,runway,terminal}=airport,[rx,rz]=runway,[tx,tz]=terminal;
  patch(drape,rx,rz,east-west-22,48,'535c60',2,.14);
  for(let x=west+38;x<east-24;x+=40)patch(drape,x,rz,16,.35,'ede8dc',0,.188);
  for(const side of [-1,1]){
    patch(drape,rx,rz+side*22.2,east-west-35,.29,'e1dfd2',0,.174);
    const end=rx+side*(east-west)*.456;
    for(const stripe of [-1,1])for(let i=1;i<=5;i++)patch(drape,end,rz+stripe*i*2.32,27,1.04,'e1dfd2',0,.187);
  }
  patch(drape,tx,tz+46,265,66,'a5a5a0',12,.15);
  for(const x of [tx-112,tx+112])
    patch(drape,x,(tz+rz)*.5+19,17,rz-tz-27,'747b7e',2,.162);
  patch(drape,tx,north+3,201,9.5,'acaa9f',1,.196,'outside');
  patch(drape,...airport.watch,10.8,8,'a5a79a',1,.192);
}

export function buildParkingLot(plot,geometry,streets){
  const {x,z,width:w,depth:d,level,angle,front}=plot,{shape,triangle,collision}=geometry;
  const c=Math.cos(angle),s=Math.sin(angle);
  const at=(a,y,b)=>[x+a*c+b*s,y,z-a*s+b*c];
  const box=(a,y,b,w,h,d,t,mat=0)=>shape('box',...at(a,y,b),w,h,d,t,mat,angle);
  function surface(a,b,w,d,t,mat,y=level+.025){
    const p=at(a-w/2,y,b-d/2),q=at(a+w/2,y,b-d/2),r=at(a+w/2,y,b+d/2),s=at(a-w/2,y,b+d/2);
    triangle(p,s,q,t,mat);triangle(q,s,r,t,mat);
  }
  const approach=entryFoundation(plot,geometry,'a9a495','aba89c',plot.access);
  surface(0,0,w,d,'63696b',2);
  for(const side of [-1,1])for(let i=0;i<Math.floor((w-4)/3);i++){
    const a=-w/2+2.5+i*3,b=side*(d/2-3.32);
    surface(a,b,.08,4.85,'e6e2d1',0,level+.046);
    if((i+side+12)%4!==0||side===front&&Math.abs(a+1.45)<plot.access*.5+1.5)continue;
    const [px,,pz]=at(a+1.45,0,b);
    streets.car(px,pz,angle+Math.PI/2,side===1?'798d97':'afa292',true,level+.025);
  }
  for(const side of [-1,1]){
    const a=side*(w/2-.15);
    box(a,level+.30,0,.27,.60,d,'8f9691',18);
    const [px,,pz]=at(a,0,0);
    collision(px,pz,.27,d,angle);
  }
  return approach;
}

export function buildWorksite(plot,geometry){
  const {x,z,width:w,depth:d,height:h,level,angle,front}=plot,{skyShape,collision}=geometry;
  const c=Math.cos(angle),s=Math.sin(angle);
  const approach=entryFoundation(plot,geometry,'8b8980','8f8d82',plot.access);
  const box=(a,y,b,w,h,d,t,mat=12)=>skyShape('box',x+a*c+b*s,y,z-a*s+b*c,w,h,d,t,mat,angle);
  const floorHeight=4.58,floors=Math.floor(h/floorHeight);
  collision(x,z,w,d,angle);
  for(let i=0;i<floors;i++){
    const y=level+i*floorHeight,top=i/floors,width=w*(top>.65?.76:.91),depth=d*(top>.65?.76:.91);
    if(top<.94)box(0,y+.20,0,width,.40,depth,'9c9a91');
    for(const side of [-1,1])for(const span of [-1,-.33,.33,1]){
      box(side*width*.46,y+floorHeight*.5,span*depth*.43,.63,floorHeight,.64,top>.63?'747575':'909089',top>.63?25:12);
      if(top>.21&&top<.78)box(side*width*.496,y+.96,span*depth*.40,.092,.94,depth*.233,'d39854',25);
    }
    if(top<.46)box(0,y+floorHeight*.52,-front*depth*.40,width*.81,floorHeight*.94,1.35,'657f8a',19);
  }
  box(0,level+h*.51,0,w*.20,h*1.01,d*.27,'969890');
  const mastX=-w*.34,mastZ=d*.22,crane=h+19;
  for(let y=0;y<crane;y+=3.8){
    for(const side of [-1,1])box(mastX+side*.99,level+y+1.9,mastZ,.28,3.83,2.11,'b68c4e',25);
    box(mastX,level+y+.13,mastZ,2.2,.26,2.18,'c7a15e',25);
  }
  box(mastX+w*.46,level+crane,mastZ,w*1.59,1.49,1.85,'c8a05c',25);
  box(mastX-w*.245,level+crane-.92,mastZ,w*.21,1.56,2.45,'8e8a78',12);
  box(mastX+w*.93,level+crane-8.3,mastZ,.08,15.6,.08,'535955',25);
  box(mastX+w*.93,level+crane-16.4,mastZ,.63,.51,.42,'9f7551',25);
  for(const side of [-1,1]){
    box(side*(w*.5+.25),level+1.13,0,.16,2.26,d,'677577',25);
    collision(x+side*(w*.5+.25)*c,z-side*(w*.5+.25)*s,.19,d,angle);
  }
  return approach;
}
