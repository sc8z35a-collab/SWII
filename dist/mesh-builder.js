// Signed distance modelling and a surface-nets polygonizer used to build smooth character
// and prop meshes in the browser instead of downloading them.
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const length=a=>Math.sqrt(dot(a,a));
export const normalize=a=>scale(a,1/(length(a)||1));
export const mix=(a,b,t)=>a+(b-a)*t;
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export function sdEllipsoid(p,c,r){
  const qx=(p[0]-c[0])/r[0],qy=(p[1]-c[1])/r[1],qz=(p[2]-c[2])/r[2];
  const k0=Math.sqrt(qx*qx+qy*qy+qz*qz);
  const k1=Math.sqrt(qx*qx/(r[0]*r[0])+qy*qy/(r[1]*r[1])+qz*qz/(r[2]*r[2]));
  return k1>1e-9?k0*(k0-1)/k1:-Math.min(r[0],r[1],r[2]);
}
// Cone with spherical ends of radius r1 at a and r2 at b.
export function sdRoundCone(p,a,b,r1,r2){
  const ba=sub(b,a),l2=dot(ba,ba),rr=r1-r2,a2=l2-rr*rr,il2=1/l2;
  const pa=sub(p,a),y=dot(pa,ba),z=y-l2;
  const w=sub(scale(pa,l2),scale(ba,y)),x2=dot(w,w),y2=y*y*l2,z2=z*z*l2;
  const k=Math.sign(rr)*rr*rr*x2;
  if(Math.sign(z)*a2*z2>k)return Math.sqrt(x2+z2)*il2-r2;
  if(Math.sign(y)*a2*y2<k)return Math.sqrt(x2+y2)*il2-r1;
  return (Math.sqrt(x2*a2*il2)+y*rr)*il2-r1;
}
export function sdCapsule(p,a,b,r){
  const pa=sub(p,a),ba=sub(b,a),h=clamp(dot(pa,ba)/dot(ba,ba),0,1);
  return length(sub(pa,scale(ba,h)))-r;
}
export function sdRoundBox(p,c,half,r){
  const q=[Math.abs(p[0]-c[0])-half[0]+r,Math.abs(p[1]-c[1])-half[1]+r,Math.abs(p[2]-c[2])-half[2]+r];
  return length([Math.max(q[0],0),Math.max(q[1],0),Math.max(q[2],0)])+Math.min(Math.max(q[0],Math.max(q[1],q[2])),0)-r;
}
export function smin(a,b,k){
  if(k<=0)return Math.min(a,b);
  const h=Math.max(k-Math.abs(a-b),0)/k;
  return Math.min(a,b)-h*h*k*.25;
}

// field(p) returns a distance; label(p) returns per-vertex data appended after the normal.
export function polygonize(field,label,min,max,h){
  const nx=Math.ceil((max[0]-min[0])/h)+1,ny=Math.ceil((max[1]-min[1])/h)+1,nz=Math.ceil((max[2]-min[2])/h)+1;
  const values=new Float32Array(nx*ny*nz);
  const at=(i,j,k)=>(k*ny+j)*nx+i;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)
    values[at(i,j,k)]=field([min[0]+i*h,min[1]+j*h,min[2]+k*h]);
  const cells=new Int32Array((nx-1)*(ny-1)*(nz-1)).fill(-1);
  const cell=(i,j,k)=>(k*(ny-1)+j)*(nx-1)+i;
  const points=[];
  const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v=new Float32Array(8);
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    let inside=0;
    for(let c=0;c<8;c++){
      v[c]=values[at(i+corners[c][0],j+corners[c][1],k+corners[c][2])];
      if(v[c]<0)inside++;
    }
    if(inside===0||inside===8)continue;
    let sx=0,sy=0,sz=0,n=0;
    for(const [a,b] of edges){
      if((v[a]<0)===(v[b]<0))continue;
      const t=v[a]/(v[a]-v[b]),ca=corners[a],cb=corners[b];
      sx+=ca[0]+(cb[0]-ca[0])*t;sy+=ca[1]+(cb[1]-ca[1])*t;sz+=ca[2]+(cb[2]-ca[2])*t;n++;
    }
    cells[cell(i,j,k)]=points.length;
    points.push([min[0]+(i+sx/n)*h,min[1]+(j+sy/n)*h,min[2]+(k+sz/n)*h]);
  }
  const quads=[];
  const emit=(a,b,c,d,flip)=>quads.push(flip?[a,d,c,b]:[a,b,c,d]);
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    const a=values[at(i,j,k)],b=values[at(i+1,j,k)];
    if((a<0)===(b<0))continue;
    emit(cells[cell(i,j-1,k-1)],cells[cell(i,j,k-1)],cells[cell(i,j,k)],cells[cell(i,j-1,k)],a<0);
  }
  for(let k=1;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const a=values[at(i,j,k)],b=values[at(i,j+1,k)];
    if((a<0)===(b<0))continue;
    emit(cells[cell(i-1,j,k-1)],cells[cell(i-1,j,k)],cells[cell(i,j,k)],cells[cell(i,j,k-1)],a<0);
  }
  for(let k=0;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const a=values[at(i,j,k)],b=values[at(i,j,k+1)];
    if((a<0)===(b<0))continue;
    emit(cells[cell(i-1,j-1,k)],cells[cell(i,j-1,k)],cells[cell(i,j,k)],cells[cell(i-1,j,k)],a<0);
  }
  // Pull each vertex onto the surface and take the field gradient as a smooth normal.
  const e=h*.25;
  const gradient=p=>normalize([
    field([p[0]+e,p[1],p[2]])-field([p[0]-e,p[1],p[2]]),
    field([p[0],p[1]+e,p[2]])-field([p[0],p[1]-e,p[2]]),
    field([p[0],p[1],p[2]+e])-field([p[0],p[1],p[2]-e])]);
  const normals=points.map((p,index)=>{
    let q=p;
    for(let iteration=0;iteration<2;iteration++){
      const d=field(q),g=gradient(q);
      q=sub(q,scale(g,clamp(d,-h,h)));
    }
    points[index]=q;
    return gradient(q);
  });
  const stride=6+label(points[0]??[0,0,0]).length;
  const vertices=new Float32Array(points.length*stride);
  for(const [i,p] of points.entries()){
    vertices.set(p,i*stride);vertices.set(normals[i],i*stride+3);vertices.set(label(p,normals[i]),i*stride+6);
  }
  const indices=[];
  for(const [a,b,c,d] of quads){
    if(a<0||b<0||c<0||d<0)continue;
    const ac=length(sub(points[a],points[c])),bd=length(sub(points[b],points[d]));
    if(ac<bd)indices.push(a,b,c,a,c,d);else indices.push(a,b,d,b,c,d);
  }
  return {vertices,indices:points.length>65535?new Uint32Array(indices):new Uint16Array(indices),stride,count:points.length};
}

// Append a separate mesh (for example a wheel) to an indexed mesh with the same stride.
export function mergeMeshes(meshes){
  const stride=meshes[0].stride;
  const vertexCount=meshes.reduce((n,m)=>n+m.vertices.length/stride,0);
  const vertices=new Float32Array(vertexCount*stride);
  const indices=[];
  let offset=0;
  for(const m of meshes){
    vertices.set(m.vertices,offset*stride);
    for(const i of m.indices)indices.push(i+offset);
    offset+=m.vertices.length/stride;
  }
  return {vertices,indices:offset>65535?new Uint32Array(indices):new Uint16Array(indices),stride,count:offset};
}
