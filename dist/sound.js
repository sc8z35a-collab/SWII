// Sound effects are synthesized on the spot, so nothing has to be downloaded.
export function createSound(){
  let context=null,noise=null,master=null,volume=.7;
  function ready(){
    if(context)return context.state==='running';
    const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
    if(!Audio)return false;
    try{
      context=new Audio();
      master=context.createGain();master.gain.value=.5*volume*volume/.49;master.connect(context.destination);
      const length=Math.floor(context.sampleRate*.6),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
      noise=buffer;
    }catch{context=null;return false;}
    return context.state==='running';
  }
  // Browsers only start audio after a gesture.
  function unlock(){
    ready();
    if(context?.state==='suspended')void context.resume().catch(()=>{});
  }
  function burst({at=0,duration=.2,from=4000,to=400,gain=.5,q=.7,type='lowpass'}){
    const t=context.currentTime+at,source=context.createBufferSource(),filter=context.createBiquadFilter(),level=context.createGain();
    source.buffer=noise;filter.type=type;filter.Q.value=q;
    filter.frequency.setValueAtTime(from,t);filter.frequency.exponentialRampToValueAtTime(Math.max(30,to),t+duration);
    level.gain.setValueAtTime(gain,t);level.gain.exponentialRampToValueAtTime(.0008,t+duration);
    source.connect(filter).connect(level).connect(master);
    source.start(t,Math.random()*.3,duration+.02);
  }
  function tone({at=0,duration=.15,from=440,to=from,gain=.2,type='sine'}){
    const t=context.currentTime+at,osc=context.createOscillator(),level=context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+duration);
    level.gain.setValueAtTime(gain,t);level.gain.exponentialRampToValueAtTime(.0008,t+duration);
    osc.connect(level).connect(master);osc.start(t);osc.stop(t+duration+.02);
  }
  const play=effect=>(...args)=>{if(ready())try{effect(...args);}catch{}};
  return {
    unlock,
    // Follows the volume setting (0-1); the default .7 keeps the original level.
    setVolume(value){volume=Math.min(1,Math.max(0,value));if(master)master.gain.value=.5*volume*volume/.49;},
    // Three barrels at once: a sharp crack, a body and a low thump, each slightly detuned.
    shot:play(()=>{
      for(let i=0;i<3;i++){
        burst({at:i*.004,duration:.07,from:9000-i*900,to:1800,gain:.5,type:'highpass'});
        burst({at:i*.004,duration:.24,from:2600-i*250,to:240,gain:.42});
      }
      tone({duration:.2,from:150,to:42,gain:.6,type:'triangle'});
      burst({at:.05,duration:.5,from:900,to:120,gain:.12});
    }),
    empty:play(()=>{tone({duration:.03,from:2200,to:900,gain:.14,type:'square'});burst({duration:.03,from:5000,to:2000,gain:.12,type:'highpass'});}),
    reload:play(()=>{
      burst({duration:.05,from:3000,to:900,gain:.25,type:'bandpass',q:3});
      tone({at:.02,duration:.05,from:700,to:300,gain:.1,type:'square'});
      burst({at:.75,duration:.09,from:1800,to:500,gain:.3,type:'bandpass',q:2});
      burst({at:1.45,duration:.05,from:4200,to:1500,gain:.3,type:'bandpass',q:4});
      tone({at:1.46,duration:.06,from:1100,to:500,gain:.12,type:'square'});
    }),
    hit:play(()=>{tone({duration:.05,from:1500,to:1100,gain:.16,type:'square'});burst({duration:.08,from:1400,to:300,gain:.2});}),
    stun:play(()=>{
      tone({duration:.5,from:520,to:130,gain:.3,type:'sawtooth'});
      tone({at:.05,duration:.6,from:262,to:65,gain:.3,type:'triangle'});
      burst({at:.15,duration:.5,from:500,to:80,gain:.3});
    }),
    pickup:play(()=>{
      tone({duration:.09,from:660,gain:.16,type:'triangle'});
      tone({at:.08,duration:.14,from:990,gain:.16,type:'triangle'});
      burst({duration:.06,from:3500,to:1500,gain:.1,type:'bandpass',q:3});
    })
  };
}
