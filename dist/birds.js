// Flocks of birds circling over the city. Each 260 m cell may hold one flock at a height set by a
// hash of the cell; birds flap and glide in turn, and only flocks near the viewer are drawn.
const CELL=260,REACH=230;
const hash=(a,b,salt=0)=>{
  let h=Math.imul(a*73856093^b*19349663^salt*83492791,0x9e3779b1);
  h=Math.imul(h^(h>>>15),0x85ebca6b);
  return ((h^(h>>>13))>>>0)/4294967296;
};
const shades={'2b2d30':[.169,.176,.188],'4a4844':[.29,.282,.267]};
// One triangle in the 'tri' instance layout (corner, edge u, normal, edge v, color, material),
// written straight into the output without temporary arrays.
function triangle(out,ax,ay,az,bx,by,bz,cx,cy,cz,color){
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const length=Math.hypot(nx,ny,nz)||1;
  out.push(ax,ay,az,ux,uy,uz,nx/length,ny/length,nz/length,vx,vy,vz,color[0],color[1],color[2],41);
}
function bird(out,x,y,z,heading,flap,span,color){
  const fx=Math.sin(heading),fz=-Math.cos(heading),lx=-Math.cos(heading),lz=-Math.sin(heading);
  const lift=Math.sin(flap)*span*.42,tip=span*.5;
  // Nose, tail, the two wing tips and the tail fan, in the bird's own frame (along, side, up).
  const nx=x+fx*.17,nz=z+fz*.17,tx=x-fx*.2,tz=z-fz*.2,ty=y-.01;
  const wx=x-fx*.05,wz=z-fz*.05,wy=y+lift;
  triangle(out,nx,y,nz,tx,ty,tz,wx+lx*tip,wy,wz+lz*tip,color);
  triangle(out,tx,ty,tz,nx,y,nz,wx-lx*tip,wy,wz-lz*tip,color);
  triangle(out,x+fx*.04,y+.01,z+fz*.04,tx,ty,tz,x-fx*.32,y+.02,z-fz*.32,color);
}
export function drawBirds(meshes,eye,seconds,groundAt){
  const cx=Math.round(eye[0]/CELL),cz=Math.round(eye[2]/CELL);
  for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++){
    if(hash(i,j)>.62)continue;
    const centerX=(i+hash(i,j,1)-.5)*CELL,centerZ=(j+hash(i,j,2)-.5)*CELL;
    if(Math.hypot(centerX-eye[0],centerZ-eye[2])>REACH+40)continue;
    const ground=groundAt?.(centerX,centerZ);
    if(!Number.isFinite(ground))continue;
    const count=6+Math.floor(hash(i,j,3)*9),radius=16+hash(i,j,4)*26,height=ground+28+hash(i,j,5)*38;
    const speed=(.22+hash(i,j,6)*.16)*(hash(i,j,7)<.5?1:-1),color=shades[hash(i,j,8)<.5?'2b2d30':'4a4844'];
    for(let k=0;k<count;k++){
      const a=seconds*speed+k*2.3999+hash(i,j,10+k)*.6;
      const r=radius*(.75+hash(i,j,30+k)*.5);
      const x=centerX+Math.cos(a)*r,z=centerZ+Math.sin(a)*r;
      if(Math.hypot(x-eye[0],z-eye[2])>REACH)continue;
      const y=height+Math.sin(seconds*.7+k*1.7)*2.2+hash(i,j,50+k)*6;
      // Tangent of the circle in the direction of travel.
      const heading=Math.atan2(-Math.sin(a)*Math.sign(speed),-Math.cos(a)*Math.sign(speed));
      const glide=Math.sin(seconds*.9+k*2.1)>.35;
      const flap=glide?.35:seconds*(15+hash(i,j,70+k)*4)+k;
      bird(meshes.tri??=[],x,y,z,heading,flap,.62+hash(i,j,90+k)*.22,color);
    }
  }
}
