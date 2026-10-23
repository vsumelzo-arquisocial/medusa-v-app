export function canPrepareBattle(game: { status: string; opponent_id: string | null; region_id: number | null }) {
  return !!game.opponent_id && (game.status === "aceptada" || (game.status === "abierta" && game.region_id !== null));
}