export async function withDeadline(ms,work,parent){
  const controller=new AbortController();
  const cancel=()=>controller.abort(parent.reason);
  if(parent?.aborted)cancel();
  else parent?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Request timed out','TimeoutError')),ms);
  try{
    if(controller.signal.aborted)throw controller.signal.reason;
    return await work(controller.signal);
  }finally{
    clearTimeout(timer);
    parent?.removeEventListener('abort',cancel);
  }
}

export async function withTabLock(name,work,locks){
  let entered=false;
  const run=()=>{entered=true;return work();};
  try{
    const manager=locks===undefined?globalThis.navigator?.locks:locks;
    return manager?.request?await manager.request(name,run):await run();
  }catch(error){
    if(entered||!['SecurityError','NotAllowedError','NotSupportedError'].includes(error.name))throw error;
    return run();
  }
}
