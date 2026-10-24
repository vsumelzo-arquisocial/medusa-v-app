/**
 * Biblioteca de sonido de Atalaya (docs/biblioteca-sonido.md).
 * Cada hueco admite varias variantes (se elige una al azar con un ligero cambio de tono).
 * Los ficheros viven en public/sfx/. Un hueco sin ficheros usa una síntesis de reserva.
 */
export type Layer = "armas" | "ambiente" | "musica" | "interfaz";

export type SoundId =
  | "macrocanon"
  | "lanza"
  | "torpedo_lanzamiento"
  | "torpedo_impacto"
  | "impacto_casco"
  | "impacto_escudo"
  | "explosion_grande"
  | "embestida"
  | "avante_toda"
  | "salto_disforme"
  | "salto_fallido"
  | "alarma"
  | "abordaje"
  | "reactor_encendido"
  | "click";

export type LoopId = "puente" | "reactor" | "musica_combate" | "musica_tension";

export interface SoundDef {
  layer: Layer;
  files: string[];
  volume: number;
}

/** Sonidos puntuales. Los ficheros actuales vienen de Wikimedia Commons (ver public/sfx/CREDITS.md). */
export const SOUNDS: Record<SoundId, SoundDef> = {
  macrocanon: { layer: "armas", files: ["/sfx/broadside.mp3"], volume: 0.6 },
  lanza: { layer: "armas", files: ["/sfx/lance.mp3"], volume: 0.7 },
  torpedo_lanzamiento: { layer: "armas", files: [], volume: 0.6 },
  torpedo_impacto: { layer: "armas", files: ["/sfx/impact.mp3"], volume: 0.7 },
  impacto_casco: { layer: "armas", files: ["/sfx/impact.mp3"], volume: 0.75 },
  impacto_escudo: { layer: "armas", files: [], volume: 0.5 },
  explosion_grande: { layer: "armas", files: ["/sfx/impact.mp3"], volume: 1 },
  embestida: { layer: "armas", files: ["/sfx/boarding.mp3"], volume: 0.9 },
  avante_toda: { layer: "armas", files: ["/sfx/engines.mp3"], volume: 0.6 },
  salto_disforme: { layer: "armas", files: [], volume: 0.8 },
  salto_fallido: { layer: "armas", files: [], volume: 0.8 },
  alarma: { layer: "ambiente", files: ["/sfx/alarm.mp3"], volume: 0.45 },
  abordaje: { layer: "armas", files: ["/sfx/boarding.mp3", "/sfx/guns.mp3"], volume: 0.7 },
  reactor_encendido: { layer: "ambiente", files: [], volume: 0.7 },
  click: { layer: "interfaz", files: [], volume: 0.3 },
};

/** Bucles de ambiente y música. */
export const LOOPS: Record<LoopId, SoundDef> = {
  puente: { layer: "ambiente", files: [], volume: 0.35 },
  reactor: { layer: "ambiente", files: [], volume: 0.3 },
  musica_combate: { layer: "musica", files: [], volume: 0.4 },
  musica_tension: { layer: "musica", files: [], volume: 0.35 },
};

/** Hojas de sprites de efectos (explosiones reales). Vacío = solo partículas. */
export interface SpriteSheet {
  src: string;
  frames: number;
  cols: number;
  size: number;
}
export const SPRITES: Partial<Record<"explosion" | "explosion_grande" | "humo", SpriteSheet>> = {};
