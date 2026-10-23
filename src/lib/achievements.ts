// Steam-style achievements computed from a player's record.
export interface PlayerStats {
  battles: number; wins: number; losses: number; draws: number; renown: number; regions: number;
  spaceport: boolean; conquestWins: number; bigBattles: number; enginesDestroyed: number; bestMargin: number; honoursUsed: number;
  raidsWon?: number; defensesWon?: number; lootTotal?: number;
}
export type Tier = "bronce" | "plata" | "oro";
export const TIER_POINTS: Record<Tier, number> = { bronce: 10, plata: 25, oro: 50 };
export interface Achievement { id: string; name: string; text: string; tier: Tier; icon: string; done: (s: PlayerStats) => boolean; progress?: (s: PlayerStats) => [number, number] }

export const ACHIEVEMENTS: Achievement[] = [
  { id: "bautismo", name: "Bautismo de fuego", text: "Juega tu primera batalla.", tier: "bronce", icon: "⚔", done: (s) => s.battles >= 1 },
  { id: "primera", name: "Primera victoria", text: "Gana una batalla.", tier: "bronce", icon: "✠", done: (s) => s.wins >= 1 },
  { id: "veterano", name: "Veterano", text: "Juega 10 batallas.", tier: "plata", icon: "✦", done: (s) => s.battles >= 10, progress: (s) => [s.battles, 10] },
  { id: "laurel", name: "Laurel de victoria", text: "Gana 5 batallas.", tier: "plata", icon: "❖", done: (s) => s.wins >= 5, progress: (s) => [s.wins, 5] },
  { id: "triunfador", name: "Triunfador", text: "Gana 15 batallas.", tier: "oro", icon: "♛", done: (s) => s.wins >= 15, progress: (s) => [s.wins, 15] },
  { id: "aplastante", name: "Victoria aplastante", text: "Gana una batalla por 10 PV o más de diferencia.", tier: "plata", icon: "☄", done: (s) => s.bestMargin >= 10 },
  { id: "armageddon", name: "Armageddon", text: "Juega una batalla de 5000 puntos.", tier: "plata", icon: "☢", done: (s) => s.bigBattles >= 1 },
  { id: "matatitanes", name: "Matatitanes", text: "Destruye 3 Titanes o Caballeros enemigos.", tier: "plata", icon: "⚒", done: (s) => s.enginesDestroyed >= 3, progress: (s) => [s.enginesDestroyed, 3] },
  { id: "cabeza", name: "Cabeza de playa", text: "Aterriza en Medusa V con tu Espaciopuerto.", tier: "bronce", icon: "✈", done: (s) => s.spaceport },
  { id: "conquistador", name: "Conquistador", text: "Controla 5 regiones de Medusa V.", tier: "plata", icon: "⚑", done: (s) => s.regions >= 5, progress: (s) => [s.regions, 5] },
  { id: "senor", name: "Señor de Medusa", text: "Controla 12 regiones.", tier: "oro", icon: "♜", done: (s) => s.regions >= 12, progress: (s) => [s.regions, 12] },
  { id: "guerra", name: "Guerra de conquista", text: "Gana 3 batallas de campaña.", tier: "plata", icon: "⚔", done: (s) => s.conquestWins >= 3, progress: (s) => [s.conquestWins, 3] },
  { id: "renombre", name: "Héroe renombrado", text: "Acumula 50 de Renombre.", tier: "plata", icon: "☼", done: (s) => s.renown >= 50, progress: (s) => [s.renown, 50] },
  { id: "corsario", name: "Corsario del vacío", text: "Gana un asalto naval contra otra nave.", tier: "bronce", icon: "☠", done: (s) => (s.raidsWon ?? 0) >= 1 },
  { id: "azote", name: "Azote de las estrellas", text: "Gana 5 asaltos navales.", tier: "plata", icon: "✹", done: (s) => (s.raidsWon ?? 0) >= 5, progress: (s) => [s.raidsWon ?? 0, 5] },
  { id: "saqueador", name: "Saqueador orbital", text: "Saquea 1000 créditos en asaltos navales.", tier: "oro", icon: "⛁", done: (s) => (s.lootTotal ?? 0) >= 1000, progress: (s) => [s.lootTotal ?? 0, 1000] },
  { id: "muro", name: "Muro de acero", text: "Rechaza un asalto naval contra tu nave.", tier: "bronce", icon: "◈", done: (s) => (s.defensesWon ?? 0) >= 1 },
  { id: "bastion", name: "Bastión del vacío", text: "Rechaza 5 asaltos navales.", tier: "plata", icon: "⛨", done: (s) => (s.defensesWon ?? 0) >= 5, progress: (s) => [s.defensesWon ?? 0, 5] },
  { id: "honor", name: "Hazaña legendaria", text: "Usa una habilidad de veteranía en batalla.", tier: "bronce", icon: "✪", done: (s) => s.honoursUsed >= 1 },
];

/** Ranking score: achievement points + 10 per win + 3 per battle + 5 per region + Renown. */
export function score(s: PlayerStats) {
  const ach = ACHIEVEMENTS.filter((a) => a.done(s)).reduce((n, a) => n + TIER_POINTS[a.tier], 0);
  return ach + s.wins * 10 + s.battles * 3 + s.regions * 5 + s.renown;
}
