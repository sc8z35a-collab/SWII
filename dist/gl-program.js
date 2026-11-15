// Shader programs are compiled in two phases: every program is handed to the driver first and the
// statuses are read afterwards. Drivers that compile on worker threads (ANGLE in Chrome and Edge,
// and any driver exposing KHR_parallel_shader_compile) then build all of them at once, and with the
// extension the renderer can wait for them without blocking the page.
function sourceContext(code,log){
  const line=+(/\d+:(\d+)/.exec(log)?.[1]??0);
  const first=Math.max(0,line-4);
  return code.split('\n').slice(first,line+2).map((text,i)=>(first+i+1)+': '+text).join('\n');
}
function uniformsOf(gl,program){
  const u={},count=gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<count;i++){
    const name=gl.getActiveUniform(program,i).name.replace(/\[0\]$/,'');
    u[name.replace(/^u/,'')]=gl.getUniformLocation(program,name);
  }
  return u;
}
// Returns a handle whose program and uniform table are read on first use (or by resolve()).
export function compileProgram(gl,vs,fs){
  const program=gl.createProgram();
  const shaders=[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].map(([type,code])=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);
    gl.compileShader(shader);
    gl.attachShader(program,shader);
    return {shader,code};
  });
  gl.linkProgram(program);
  let result=null,failure=null;
  function resolve(){
    if(result)return result;
    if(failure)throw failure;
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
      // Only a failed link pays for the per-shader queries.
      for(const {shader,code} of shaders)if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const log=gl.getShaderInfoLog(shader)??'';
        failure=Error(log+'\n'+sourceContext(code,log));
      }
      failure??=Error(gl.getProgramInfoLog(program)??'Program link failed');
      for(const {shader} of shaders)gl.deleteShader(shader);
      gl.deleteProgram(program);
      throw failure;
    }
    for(const {shader} of shaders){gl.detachShader(program,shader);gl.deleteShader(shader);}
    result={program,u:uniformsOf(gl,program)};
    return result;
  }
  return {
    resolve,
    get program(){return resolve().program;},
    get u(){return resolve().u;},
    // True once the driver has finished, so resolve() will not block (always true without the extension).
    completed(parallel){return !parallel||result!==null||failure!==null||gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR)===true;}
  };
}
// Waits for programs without blocking the page where the driver reports progress.
export function whenCompiled(gl,programs){
  const parallel=gl.getExtension('KHR_parallel_shader_compile');
  return new Promise((done,fail)=>{
    const check=()=>{
      try{
        if(programs.every(p=>p.completed(parallel))){for(const p of programs)p.resolve();done();}
        else setTimeout(check,16);
      }catch(error){fail(error);}
    };
    check();
  });
}
