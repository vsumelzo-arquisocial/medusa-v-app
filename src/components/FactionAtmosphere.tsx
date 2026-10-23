import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { profileQuery } from '@/lib/profile';
import { factionAtmosphere } from '@/lib/faction-atmosphere';
export function FactionAtmosphere(){
 const {data}=useQuery({...profileQuery,retry:false});
 const p=data?.profile;const identity=factionAtmosphere(p?.army_race,p?.army_faction,p?.army_variant);
 useEffect(()=>{if(!p?.army_faction)return;const root=document.documentElement;root.dataset['fleet']=identity.fleet;return()=>{delete root.dataset['fleet'];};},[p?.army_faction,identity.fleet]);
 if(!p?.army_faction||!identity.emblem)return null;
 return <div className="faction-watermark" aria-hidden="true"><img src={identity.emblem} alt="" width={512} height={512}/></div>;
}