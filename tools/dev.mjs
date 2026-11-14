import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const args=process.argv.slice(2);
function value(flag,fallback){
  const exact=args.indexOf(flag);
  return (exact>=0?args[exact+1]:args.find(arg=>arg.startsWith(flag+'='))?.slice(flag.length+1))??fallback;
}
const port=value('--port',process.env.PORT??'8787');
const host=value('--host',process.env.HOST??'0.0.0.0');
const child=spawn(process.execPath,[wrangler,'dev','--ip',host,'--port',port,'--show-interactive-dev-session=false'],{
  stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code??1;});
