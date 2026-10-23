// One-use veteran honours won at random in battle (see public.process_veterans), plus orbital support house rules.
// Ability ids and costs mirror public.honour_cost in the database.
export type HonourKind = "titan" | "caballero" | "superpesado" | "personaje";

export interface Honour { id: string; name: string; cost: number; kinds: HonourKind[]; text: string }

export const HONOURS: Honour[] = [
  { id: "repetir_disparo", name: "Ojo del Princeps", cost: 10, kinds: ["titan", "caballero", "superpesado"], text: "Una vez: repite todas las tiradas para impactar fallidas de un arma en una acción de disparo." },
  { id: "recarga_escudos", name: "Recarga total de escudos", cost: 20, kinds: ["titan"], text: "Una vez, en la fase final: restaura todos los Escudos de Vacío del Titán." },
  { id: "reactor_estable", name: "Reactor sacralizado", cost: 15, kinds: ["titan"], text: "Una vez: ignora una tirada de Reactor o Daño Crítico recién sufrida." },
  { id: "paso_firme", name: "Paso de la Legio", cost: 10, kinds: ["titan", "caballero"], text: "Una vez: mueve hasta 5 cm adicionales y aun así dispara con normalidad." },
  { id: "blindaje_reforzado", name: "Placas bendecidas", cost: 15, kinds: ["caballero", "superpesado"], text: "Una vez: repite una tirada de salvación fallida." },
  { id: "fuego_preciso", name: "Artillero veterano", cost: 10, kinds: ["superpesado"], text: "Una vez: un arma gana Precisa (Accurate) durante una acción de disparo." },
  { id: "motor_forzado", name: "Motores forzados", cost: 10, kinds: ["superpesado", "caballero"], text: "Una vez: duplica el movimiento en una orden de Avanzar sin penalización." },
  { id: "medico_mejorado", name: "Apotecario veterano", cost: 10, kinds: ["personaje"], text: "Una vez: el destacamento del comandante ignora una baja recién sufrida (devuelve 1 miniatura)." },
  { id: "orden_inspiradora", name: "Orden inspiradora", cost: 10, kinds: ["personaje"], text: "Una vez: una unidad amiga a 15 cm o menos repite una tirada (impacto, salvación o moral)." },
  { id: "duelo_heroico", name: "Duelo heroico", cost: 15, kinds: ["personaje"], text: "Una vez: suma +2 a la tirada de combate cuerpo a cuerpo del comandante." },
  { id: "ultima_resistencia", name: "Última resistencia", cost: 15, kinds: ["personaje"], text: "Una vez: la formación del comandante supera automáticamente un chequeo de moral o de quiebre." },
];
export const honourById = (id: string) => HONOURS.find((h) => h.id === id);

/** Which honour family a unit belongs to (null = cannot carry honours). */
export function honourKind(u: { name: string; unit_type?: { type: string } }, category?: string): HonourKind | null {
  if (category === "titan" || /titan/i.test(u.name)) return "titan";
  if (category === "caballero" || /knight|armiger|moirax/i.test(u.name)) return "caballero";
  if (u.unit_type?.type === "Super-Heavy Vehicle") return "superpesado";
  if (/command|praetor|consul|centurion|delegatus|archmagos|tribune/i.test(u.name)) return "personaje";
  return null;
}

export const SUPPORT_RULES = {
  orbital: { name: "Bombardeo orbital (Baterías orbitales)", text: "Una vez por batalla, al inicio de una ronda: elige un punto del tablero visible para cualquier unidad propia y coloca la plantilla de 3\". Cada destacamento total o parcialmente debajo recibe 1 impacto con AP −2, Ignora Cobertura. Contra Titanes impacta contra los Escudos de Vacío. Después hay que recargar las baterías en la nave." },
  pod: { name: "Cápsula de desembarco (Drop Pod)", text: "Un destacamento de infantería de Legiones Astartes puede empezar en reserva y llegar por Asalto Orbital (Deep Strike) en la fase de movimiento, a más de 15 cm de cualquier enemigo, sin necesitar transporte. La cápsula se consume y hay que fabricarla de nuevo." },
};
