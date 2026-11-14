export const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers
}});
export function trustedOrigin(request,url,requireOrigin=false){
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return false;
  const origin=request.headers.get('Origin');
  return origin?origin===url.origin:!requireOrigin;
}
export function localHost(url){
  return ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
}
export function cookieName(url){
  return url.protocol==='https:'?'__Host-atlantis-v3':localHost(url)?'atlantis-local-v3':null;
}
export function readToken(request,name){
  if(!name)return null;
  for(const field of (request.headers.get('Cookie')??'').split(';')){
    const [key,value]=field.trim().split('=');
    if(key===name&&/^[0-9a-f]{64}$/.test(value??''))return value;
  }
  return null;
}
export function sessionCookie(name,token){
  return name+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000'+(name.startsWith('__Host-')?'; Secure':'');
}
