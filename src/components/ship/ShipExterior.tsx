import { useEffect,useRef,useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2,VolumeX } from 'lucide-react';
import type { FleetId } from '@/lib/ship-identity';

/** Live presentation only: hull and travel state are supplied by the naval RPC. */
export function ShipExterior({image,name,hull,maxHull,moving=false,warp=false,damagedModules=0,fleet}:{image:string;name:string;hull:number;maxHull:number;moving?:boolean;warp?:boolean;damagedModules?:number;fleet:FleetId}){
 const canvas=useRef<HTMLCanvasElement>(null);const [sound,setSound]=useState(false);
 const damage=Math.max(0,Math.min(1,1-hull/Math.max(1,maxHull)));
 useEffect(()=>{const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;
  const picture=new Image();picture.src=image;let frame=0;let stopped=false;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css=getComputedStyle(document.documentElement);const primary=css.getPropertyValue('--primary').trim();const warning=css.getPropertyValue('--destructive').trim();const gas=css.getPropertyValue('--space-gas').trim();
  c.width=1200;c.height=650;
  const draw=(time:number)=>{if(stopped)return;const t=reduced?0:time/1000;ctx.fillStyle=css.getPropertyValue('--ship-space');ctx.fillRect(0,0,1200,650);
   ctx.fillStyle=gas;for(let i=0;i<100;i++){const x=(i*137.37-(moving?t*32:0)+120000)%1200;const y=(i*83.91)%650;ctx.globalAlpha=.18+(i%4)*.12;ctx.fillRect(x,y,i%5===0?2:1,1);}ctx.globalAlpha=1;
   const bob=reduced?0:Math.sin(t*.6)*5;ctx.save();ctx.translate(0,bob);
   if(picture.complete&&picture.naturalWidth){ctx.drawImage(picture,120,0,960,640);}
   // No artwork replacement: engine jets and breach overlays follow the ship footprint.
   if(moving||warp){for(let j=0;j<2;j++){const x=310,y=355+j*30;const length=warp?200:120;ctx.save();ctx.globalCompositeOperation='screen';const flame=ctx.createLinearGradient(x-length,y,x+8,y);flame.addColorStop(0,'transparent');flame.addColorStop(.7,primary);flame.addColorStop(1,gas);ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(x,y-7);ctx.quadraticCurveTo(x-length*.55,y-18,x-length-15*Math.sin(t*18+j),y);ctx.quadraticCurveTo(x-length*.55,y+18,x,y+7);ctx.fill();ctx.restore();}}
   const breaches=damage>0?Math.min(5,Math.ceil(damage*5)):Math.min(2,damagedModules);for(let n=0;n<breaches;n++){const x=485+n*75,y=310+(n%2)*48;
    ctx.strokeStyle=warning;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-14,y-8);ctx.lineTo(x-4,y+3);ctx.lineTo(x+6,y-5);ctx.lineTo(x+18,y+6);ctx.stroke();
    ctx.fillStyle=css.getPropertyValue('--ship-space');ctx.beginPath();ctx.ellipse(x,y,9+damage*8,4+damage*4,-.3,0,Math.PI*2);ctx.fill();
    for(let k=0;k<14;k++){const age=((t*.5+k/14+n*.2)%1);ctx.globalAlpha=(1-age)*.55;ctx.strokeStyle=gas;ctx.lineWidth=2+age*10;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-20-age*15,y-age*45,x-40-age*55,y-age*105);ctx.stroke();}ctx.globalAlpha=1;
    ctx.fillStyle=warning;ctx.globalAlpha=.6+.3*Math.sin(t*8+n);ctx.fillRect(x-2,y-2,4,4);ctx.globalAlpha=1;
   }ctx.restore();if(warp){ctx.strokeStyle=primary;ctx.globalAlpha=.3;for(let i=0;i<9;i++){const y=(i*73+t*19)%650;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y-150);ctx.stroke();}ctx.globalAlpha=1;}
   if(!reduced)frame=requestAnimationFrame(draw);
  };picture.onload=()=>{if(reduced)draw(performance.now());};frame=requestAnimationFrame(draw);return()=>{stopped=true;cancelAnimationFrame(frame);picture.onload=null;};
 },[image,damage,moving,warp,damagedModules]);
 useEffect(()=>{if(!sound||(!moving&&!warp))return;const audio=new AudioContext();const oscillator=audio.createOscillator();const gain=audio.createGain();const filter=audio.createBiquadFilter();oscillator.type='sawtooth';oscillator.frequency.value=warp?45:33;filter.type='lowpass';filter.frequency.value=110;gain.gain.value=.06;oscillator.connect(filter);filter.connect(gain);gain.connect(audio.destination);oscillator.start();return()=>{oscillator.stop();void audio.close();};},[sound,moving,warp]);
 return <section className="ship-exterior relative overflow-hidden" data-fleet={fleet} aria-label={`Vista exterior de ${name}: casco ${hull}/${maxHull}, ${warp?'en el warp':moving?'en tránsito':'en órbita'}${damage>0?', daños y fugas de gas':''}`}>
  <canvas ref={canvas} className="block aspect-[24/13] w-full" role="img" aria-label={`Nave ${name} con ${Math.round(damage*100)}% de daño de casco`}/>
  <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-xs text-space-gas"><span>{warp?'TRÁNSITO WARP · PROTEGIDA':moving?'PROPULSORES ACTIVOS · EN RUTA':'ÓRBITA ESTABLE'}</span></div>
  <Button variant="outline" size="icon" className="absolute right-3 top-3 bg-background" aria-label={sound?'Silenciar motores':'Activar sonido de motores'} title={sound?'Silenciar motores':'Activar sonido de motores'} onClick={()=>setSound(!sound)}>{sound?<Volume2/>:<VolumeX/>}</Button>
  <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-background/90 px-3 py-2 text-xs"><span className="text-primary">{name}</span><span className={damage>0?'text-destructive':'text-foreground'}>Casco {hull}/{maxHull} · {damage>0?`Daños ${Math.round(damage*100)}%`:damagedModules?'Averías de sistemas':'Sin brechas'}</span></div>
 </section>;
}