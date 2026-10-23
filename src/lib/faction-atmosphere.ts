import { fleetId } from '@/lib/ship-identity';
import { emblemsFor40k, emblemSrc } from '@/lib/emblems';
export function factionAtmosphere(race?:string|null,faction?:string|null,variant?:string|null){
 const fleet=fleetId(race,faction);
 const mottos={imperium:'El Emperador protege',chaos:'La galaxia arderá',tau:'Por el Bien Supremo',aeldari:'Por los mundos astronave',drukhari:'Desde la Ciudad Oscura',orks:'¡Waaagh!',necrons:'La dinastía despierta',tyranids:'La voluntad del enjambre',daemons:'La disformidad nos reclama',votann:'Los ancestros nos guían',genestealer:'El día de la ascensión'};
 return {fleet,motto:mottos[fleet],emblem:emblemsFor40k(faction,variant)[0]?.src??emblemSrc(fleet==='chaos'?'chaos_star':'aquila')};
}