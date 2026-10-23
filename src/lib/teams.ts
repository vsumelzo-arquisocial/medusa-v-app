// Team games: 1v1, 1v2 (creator alone vs two), 2v1 (creator + ally vs one), 2v2.
// games.points is the total per side; a side with two commanders splits it in half.
export type GameFormat = "1v1" | "1v2" | "2v1" | "2v2";
export type TeamSide = "creator" | "opponent";

export const FORMATS: { id: GameFormat; label: string; text: string }[] = [
  { id: "1v1", label: "1 vs 1", text: "Duelo clásico." },
  { id: "1v2", label: "Yo solo vs 2", text: "Tú con todos los puntos contra dos rivales con la mitad cada uno." },
  { id: "2v1", label: "Mi equipo (2) vs 1", text: "Tú y un aliado con la mitad cada uno contra un rival con todos los puntos." },
  { id: "2v2", label: "2 vs 2", text: "Dos equipos de dos; cada comandante lleva la mitad de los puntos del bando." },
];

export const teamSize = (f: GameFormat, side: TeamSide) =>
  side === "creator" ? (f === "2v1" || f === "2v2" ? 2 : 1) : (f === "1v2" || f === "2v2" ? 2 : 1);

/** Points each commander of a side may field. */
export const playerPoints = (f: GameFormat, sidePoints: number, side: TeamSide) => Math.floor(sidePoints / teamSize(f, side));

export const isTeamGame = (f: string) => f !== "1v1";

/** House rules shown in the battle assistant to keep team turns fair. */
export const TEAM_RULES: Record<Exclude<GameFormat, "1v1">, string[]> = {
  "1v2": [
    "Iniciativa por bando: el comandante en solitario gana los empates de iniciativa.",
    "Activaciones alternas por bando: el equipo de dos activa una formación (de cualquiera de sus dos ejércitos) y después el rival, hasta agotar.",
    "Si un bando tiene más formaciones, las sobrantes se activan al final de forma consecutiva.",
    "Los dos ejércitos aliados cuentan como uno para quiebre y derrota; pueden compartir objetivos pero no transportes ni órdenes.",
  ],
  "2v1": [
    "Iniciativa por bando: el comandante en solitario gana los empates de iniciativa.",
    "Activaciones alternas por bando: el equipo de dos activa una formación y después el rival, hasta agotar.",
    "Si un bando tiene más formaciones, las sobrantes se activan al final de forma consecutiva.",
    "Los dos ejércitos aliados cuentan como uno para quiebre y derrota.",
  ],
  "2v2": [
    "Iniciativa por bando: tira un comandante de cada equipo; dentro del equipo se alternan cada ronda.",
    "Activaciones alternas por bando; el equipo decide qué ejército activa, pero ningún jugador puede activar dos formaciones seguidas si su aliado aún tiene formaciones sin activar.",
    "Cada equipo despliega en la misma zona del escenario, repartida en dos mitades.",
    "Los dos ejércitos de un equipo cuentan como uno para quiebre, objetivos y derrota.",
  ],
};
