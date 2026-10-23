import imperium from '@/assets/ship/imperium.jpg';
import chaos from '@/assets/ship/chaos.jpg';
import tau from '@/assets/ship/tau.jpg';
import aeldari from '@/assets/ship/aeldari.jpg';
import drukhari from '@/assets/ship/drukhari.jpg';
import orks from '@/assets/ship/orks.jpg';
import necrons from '@/assets/ship/necrons.jpg';
import tyranids from '@/assets/ship/tyranids.jpg';
import daemons from '@/assets/ship/daemons.jpg';
import votann from '@/assets/ship/votann.jpg';
import genestealer from '@/assets/ship/genestealer.jpg';
import { get40kFaction } from '@/lib/warhammer40k-factions';

export const FLEETS = {
  imperium: { image: imperium, name: 'Flota del Imperium', hull: 30, specialty: 'Diseño equilibrado', theme: 'fleet-imperium' },
  chaos: { image: chaos, name: 'Flota del Caos', hull: 30, specialty: '+1 impacto de Abordaje', theme: 'fleet-chaos' },
  tau: { image: tau, name: 'Flota del Bien Supremo', hull: 22, specialty: '+2 Andanada/Lanza · −1 Abordaje', theme: 'fleet-tau' },
  aeldari: { image: aeldari, name: 'Flota de los mundos astronave', hull: 24, specialty: 'Evasión: −2 impactos · +1 uso por bloque', theme: 'fleet-aeldari' },
  drukhari: { image: drukhari, name: 'Flota de la Ciudad Oscura', hull: 22, specialty: 'Evasión: −1 impacto · +1 Abordaje', theme: 'fleet-drukhari' },
  orks: { image: orks, name: 'Flota del Waaagh!', hull: 40, specialty: '+2 Abordaje · −1 Andanada/Lanza', theme: 'fleet-orks' },
  necrons: { image: necrons, name: 'Flota de las dinastías', hull: 34, specialty: '+1 casco al ganar con Escudos', theme: 'fleet-necrons' },
  tyranids: { image: tyranids, name: 'Flota enjambre', hull: 36, specialty: '+2 Abordaje · −1 Lanza', theme: 'fleet-tyranids' },
  daemons: { image: daemons, name: 'Flota de la disformidad', hull: 28, specialty: '+1 Abordaje · −1 Lanza', theme: 'fleet-chaos' },
  votann: { image: votann, name: 'Flota de las Ligas', hull: 36, specialty: '−1 impacto recibido · −1 Andanada', theme: 'fleet-votann' },
  genestealer: { image: genestealer, name: 'Flota del culto', hull: 28, specialty: '+1 impacto de Abordaje', theme: 'fleet-genestealer' },
} as const;
export type FleetId = keyof typeof FLEETS;
export function fleetId(race?: string | null, faction?: string | null): FleetId {
  if (faction === 'drukhari') return 'drukhari';
  if (faction === 'genestealer-cults') return 'genestealer';
  const inferred: Record<string,FleetId> = { 'tau-empire':'tau', aeldari:'aeldari', orks:'orks', necrons:'necrons', tyranids:'tyranids', 'leagues-of-votann':'votann', 'chaos-daemons':'daemons' };
  if (!race && faction && inferred[faction]) return inferred[faction];
  if (race === 'humanity' || !race) return get40kFaction(faction ?? '')?.group === 'chaos' ? 'chaos' : 'imperium';
  return race in FLEETS ? race as FleetId : 'imperium';
}
export const fleetFor = (race?: string | null, faction?: string | null) => FLEETS[fleetId(race, faction)];
export const MODULE_IDS = ['puente','bodegas','casco','baterias','camara_escudos','cubierta_abordaje','motores_plasma','lanza_proa','blindaje_proa','caja_creditos','astropatico','forja'] as const;
const names: Record<FleetId, string[]> = {
  imperium: ['Puente de mando','Bodega de unidades','Casco de adamantio','Baterías macrocannón','Escudos de vacío','Cubierta de abordaje','Motores de plasma','Lanza de proa','Blindaje de proa','Cámara del diezmo','Coro astropático','Astillero del Mechanicus'],
  chaos: ['Trono del comandante','Bodega de guerra','Casco profanado','Baterías de devastación','Barrera disforme','Cubierta de saqueadores','Propulsores infernales','Lanza maldita','Blindaje corrupto','Arca de tributos','Coro de hechiceros','Forja oscura'],
  tau: ['Centro de coordinación','Bahías de despliegue','Estructura de nanocompuesto','Baterías de aceleradores','Barrera de energía','Bahía de equipos de incursión','Propulsores gravitacionales','Acelerador de proa','Blindaje compuesto','Reserva del Bien Supremo','Red de comunicaciones','Astillero de drones'],
  aeldari: ['Nexo de videntes','Cámaras de tránsito','Estructura de hueso espectral','Baterías de pulsos','Campos holísticos','Portal de incursión','Velas solares','Lanza pulsar','Armadura espectral','Cámara de recursos','Enlace psíquico','Jardín de cantores'],
  drukhari: ['Trono del arconte','Bodegas de la incursión','Casco de filos oscuros','Baterías de fragmentos','Campo de sombras','Cubierta de corsarios','Velas de éter','Lanza oscura','Placas de obsidiana','Tesoro de la cábala','Red de susurros','Taller de la Ciudad Oscura'],
  orks: ['Puente del Kapitán','Bodega de los muchachoz','Montón de chapa','Baterías de dakka','Campo de fuerza','Rampa de asalto','Motores del Mek','Kañón de proa','Chapa reforzada','Caja del botín','Radio del Waaagh!','Taller del Gran Mek'],
  necrons: ['Nexo de mando','Cámaras de estasis','Casco de metal viviente','Baterías gauss','Barrera de fase','Portal de translocación','Impulsores inerciales','Arco de partículas','Coraza necrodérmica','Cámara de reservas','Enlace de la dinastía','Cámara de reconstrucción'],
  tyranids: ['Nódulo sináptico','Cámara de biomasa','Caparazón vivo','Espinas de bioplasma','Membrana protectora','Cámara de organismos invasores','Órganos de propulsión','Lanza bioeléctrica','Quitina reforzada','Reserva de nutrientes','Red sináptica','Órgano regenerador'],
  daemons: ['Trono de la disformidad','Cámaras de manifestación','Envoltura ectoplásmica','Baterías infernales','Velo disforme','Grieta de invasión','Impulso de éter','Rayo de la disformidad','Coraza demoníaca','Arca de tributos','Coro de evocadores','Forja de almas'],
  votann: ['Nexo del Kâhl','Bodegas de la Liga','Casco de aleación','Baterías magnéticas','Escudos de la Liga','Cubierta de pioneros','Propulsores de fusión','Lanza de haces','Placas de alta densidad','Bóveda de la Liga','Red de los ancestros','Astillero Brôkhyr'],
  genestealer: ['Centro del patriarca','Bodegas del culto','Casco industrial','Baterías recuperadas','Pantalla de protección','Cubierta de infiltración','Motores adaptados','Taladro de proa','Placas de chatarra','Caja de la insurrección','Red clandestina','Taller del culto'],
};
export function moduleName(id: string, fleet: FleetId): string {
  const index = MODULE_IDS.findIndex(x => x === id);
  return index < 0 ? id : names[fleet][index] ?? id;
}
export const hullRepairCost = (missing: number) => Math.max(0, missing) * 5;
export const protectedCredits = (credits: number, level: number) => Math.floor(Math.max(0, credits) * Math.min(3, Math.max(0, level)) / 10);
export const recruitmentSeconds = (points: number, level: number) => Math.ceil(36 * points * (1 - .1 * Math.min(3, Math.max(0, level))));
export const timeoutWinner = (attackerReady: boolean, defenderReady: boolean) => attackerReady && defenderReady ? null : attackerReady ? 'atacante' : 'defensor';