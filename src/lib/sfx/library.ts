/**
 * Biblioteca de sonido de Atalaya (docs/biblioteca-sonido.md).
 * Ficheros en public/sfx/lib/, generados con scripts/build-sfx.py a partir del
 * Sonniss #GameAudioGDC Bundle 2026 (libre de derechos, sin atribución obligatoria) y otros
 * (créditos en public/sfx/CREDITS.md). Cada hueco tiene variantes: se elige una al azar.
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
  | "reactor_encendido"
  | "inicio_combate"
  | "radar_ping"
  | "click"
  | "aviso"
  | "denegar"
  | "registro"
  | "abordaje";

export type LoopId = "puente" | "reactor" | "musica_tension" | "musica_combate";

export interface SoundDef {
  layer: Layer;
  files: string[];
  volume: number;
}

export const SOUNDS: Record<SoundId, SoundDef> = {
  macrocanon: {
    layer: "armas",
    files: [
      "/sfx/lib/macrocanon_1.mp3",
      "/sfx/lib/macrocanon_2.mp3",
      "/sfx/lib/macrocanon_3.mp3",
      "/sfx/lib/macrocanon_4.mp3",
    ],
    volume: 0.75,
  },
  lanza: {
    layer: "armas",
    files: ["/sfx/lib/lanza_1.mp3", "/sfx/lib/lanza_2.mp3", "/sfx/lib/lanza_3.mp3"],
    volume: 0.7,
  },
  torpedo_lanzamiento: {
    layer: "armas",
    files: ["/sfx/lib/torpedo_lanzamiento_1.mp3", "/sfx/lib/torpedo_lanzamiento_2.mp3"],
    volume: 0.55,
  },
  torpedo_impacto: {
    layer: "armas",
    files: [
      "/sfx/lib/torpedo_impacto_1.mp3",
      "/sfx/lib/torpedo_impacto_2.mp3",
      "/sfx/lib/torpedo_impacto_3.mp3",
    ],
    volume: 0.7,
  },
  impacto_casco: {
    layer: "armas",
    files: [
      "/sfx/lib/impacto_casco_1.mp3",
      "/sfx/lib/impacto_casco_2.mp3",
      "/sfx/lib/impacto_casco_3.mp3",
      "/sfx/lib/impacto_casco_4.mp3",
    ],
    volume: 0.7,
  },
  impacto_escudo: {
    layer: "armas",
    files: ["/sfx/lib/impacto_escudo_1.mp3", "/sfx/lib/impacto_escudo_2.mp3"],
    volume: 0.55,
  },
  explosion_grande: {
    layer: "armas",
    files: ["/sfx/lib/explosion_grande_1.mp3", "/sfx/lib/explosion_grande_2.mp3"],
    volume: 1,
  },
  embestida: {
    layer: "armas",
    files: ["/sfx/lib/embestida_1.mp3", "/sfx/lib/embestida_2.mp3"],
    volume: 0.95,
  },
  avante_toda: { layer: "armas", files: ["/sfx/lib/avante_toda_1.mp3"], volume: 0.6 },
  salto_disforme: {
    layer: "armas",
    files: ["/sfx/lib/salto_disforme_1.mp3", "/sfx/lib/salto_disforme_2.mp3"],
    volume: 0.85,
  },
  salto_fallido: { layer: "armas", files: ["/sfx/lib/salto_fallido_1.mp3"], volume: 0.85 },
  alarma: {
    layer: "ambiente",
    files: ["/sfx/lib/alarma_1.mp3", "/sfx/lib/alarma_2.mp3"],
    volume: 0.4,
  },
  reactor_encendido: {
    layer: "ambiente",
    files: ["/sfx/lib/reactor_encendido_1.mp3"],
    volume: 0.7,
  },
  inicio_combate: {
    layer: "musica",
    files: ["/sfx/lib/inicio_combate_1.mp3", "/sfx/lib/inicio_combate_2.mp3"],
    volume: 0.6,
  },
  radar_ping: { layer: "interfaz", files: ["/sfx/lib/radar_ping_1.mp3"], volume: 0.4 },
  click: {
    layer: "interfaz",
    files: ["/sfx/lib/click_1.mp3", "/sfx/lib/click_2.mp3"],
    volume: 0.35,
  },
  aviso: { layer: "interfaz", files: ["/sfx/lib/aviso_1.mp3"], volume: 0.45 },
  denegar: { layer: "interfaz", files: ["/sfx/lib/denegar_1.mp3"], volume: 0.45 },
  registro: { layer: "interfaz", files: ["/sfx/lib/registro_1.mp3"], volume: 0.25 },
  abordaje: { layer: "armas", files: ["/sfx/boarding.mp3", "/sfx/guns.mp3"], volume: 0.7 },
};

export const LOOPS: Record<LoopId, SoundDef> = {
  puente: {
    layer: "ambiente",
    files: ["/sfx/lib/puente_1.mp3", "/sfx/lib/puente_2.mp3"],
    volume: 0.5,
  },
  reactor: { layer: "ambiente", files: ["/sfx/lib/reactor_1.mp3"], volume: 0.35 },
  musica_tension: { layer: "musica", files: ["/sfx/musica/aproximacion.mp3"], volume: 0.6 },
  musica_combate: { layer: "musica", files: ["/sfx/musica/combate.mp3"], volume: 0.6 },
};

/** Hojas de sprites de efectos (explosiones reales). Vacío = solo partículas. */
export interface SpriteSheet {
  src: string;
  frames: number;
  cols: number;
  size: number;
}
export const SPRITES: Partial<Record<"explosion" | "explosion_grande" | "humo", SpriteSheet>> = {};
