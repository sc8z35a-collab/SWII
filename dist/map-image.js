export function mapImageSource(url,refresh,needed=()=>true){
  const image=new Image();
  let started=false,failures=0,timer=0,requests=0;
  function load(){
    started=true;
    image.src=url+(requests?'?retry='+requests:'');
    requests++;
  }
  image.addEventListener('load',()=>{
    clearTimeout(timer);timer=0;
    refresh();
  });
  image.addEventListener('error',()=>{
    started=false;
    failures++;
    clearTimeout(timer);timer=0;
    if(failures<4&&needed()){
      timer=setTimeout(()=>{timer=0;if(needed())load();},700*failures);
    }
  });
  return {image,ensure(){
    if(!started&&!timer&&failures<4)load();
  },reopen(){
    if(!started&&!timer){failures=0;load();}
  }};
}
