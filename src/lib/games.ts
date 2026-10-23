import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GameSize = "escaramuza" | "batalla" | "armageddon";
export const GAME_SIZES: { id: GameSize; label: string; points: number }[] = [
  { id: "escaramuza", label: "Escaramuza", points: 1500 },
  { id: "batalla", label: "Batalla", points: 3000 },
  { id: "armageddon", label: "Armageddon", points: 5000 },
];
export const pointsFor = (s: GameSize) => GAME_SIZES.find((g) => g.id === s)!.points;
export const sizeLabel = (s: string) => GAME_SIZES.find((g) => g.id === s)?.label ?? s;

export function pickRandom<T>(xs: T[], rnd: () => number = Math.random): T | undefined {
  return xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined;
}

export const STATUS_LABEL: Record<string, string> = {
  abierta: "Abierta", aceptada: "Aceptada", rechazada: "Rechazada", cancelada: "Cancelada", finalizada: "Finalizada", en_curso: "En curso",
};

export const playersQuery = queryOptions({
  queryKey: ["players"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("list_players");
    if (error) throw error;
    return data ?? [];
  },
});

export const scenariosQuery = queryOptions({
  queryKey: ["scenarios"],
  queryFn: async () => {
    const { data, error } = await supabase.from("scenarios").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

export const gamesQuery = queryOptions({
  queryKey: ["games"],
  queryFn: async () => {
    const { data, error } = await supabase.from("games").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});
