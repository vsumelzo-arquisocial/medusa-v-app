// Asalto profundo: ataque o toma de una región no vecina del planeta donde orbita la nave.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeepStrikeStatus {
  level: number;
  operational: boolean;
  charged: boolean;
  ready_at: string | null;
  cost: number;
  last_used_at: string | null;
  server_now: string;
}

export const deepStrikeQuery = queryOptions({
  queryKey: ["deep-strike"],
  refetchInterval: 60000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("deep_strike_status" as never);
    if (error) return null;
    return data as unknown as DeepStrikeStatus;
  },
});

export const deepStrikeCost = (level: number) => (level >= 3 ? 1000 : level === 2 ? 1500 : 2000);

const ERR: Record<string, string> = {
  "deep strike unavailable": "Necesitas el módulo de asalto profundo operativo.",
  "deep strike not charged": "El módulo de asalto profundo no tiene carga.",
  "deep strike spaceport": "No se puede lanzar un asalto profundo contra una zona de desembarco.",
  "deep strike adjacent": "Esa región es vecina: atácala de forma normal y guarda la carga.",
  "not landed": "Necesitas tu zona de desembarco en este planeta.",
  "ship not here": "Tu nave debe estar orbitando este planeta.",
  "already charged": "El módulo ya está cargado.",
  recharging: "La recarga ya está en curso.",
  "insufficient credits": "No tienes créditos suficientes.",
  "ship busy": "Tu nave está en combate.",
  "one neutral claim": "Ya tienes una toma neutral en curso.",
  "one player attack": "Ya tienes un ataque a jugador en curso.",
  "region contested": "Esa región ya está en disputa.",
  "list needs recruited units": "Esa lista aún no es jugable: te faltan unidades por reclutar.",
  "list over points": "La lista supera los puntos.",
  "list kind mismatch": "La lista no es de este tipo de partida.",
};
export const deepStrikeError = (m: string) =>
  Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? m;
