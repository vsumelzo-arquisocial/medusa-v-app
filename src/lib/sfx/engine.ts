/**
 * Motor de audio por capas (armas, ambiente, música, interfaz) con Web Audio.
 * - Variantes aleatorias y ligera variación de tono para que nada suene repetido.
 * - Panorama estéreo: un disparo por estribor suena a la derecha.
 * - Síntesis de reserva para los huecos que aún no tienen grabación.
 */
import { LOOPS, SOUNDS, type Layer, type LoopId, type SoundId } from "./library";

export interface AudioSettings {
  muted: boolean;
  master: number;
  layers: Record<Layer, number>;
}

const KEY = "atalaya-audio";
const DEFAULTS: AudioSettings = {
  muted: false,
  master: 0.8,
  layers: { armas: 1, ambiente: 0.7, musica: 0.5, interfaz: 0.6 },
};

let settings: AudioSettings = load();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const layerGain = new Map<Layer, GainNode>();
const buffers = new Map<string, AudioBuffer | null>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const loops = new Map<LoopId, { src: AudioBufferSourceNode | OscillatorNode[]; gain: GainNode }>();
const listeners = new Set<(s: AudioSettings) => void>();

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw)
      return {
        ...DEFAULTS,
        ...JSON.parse(raw),
        layers: { ...DEFAULTS.layers, ...JSON.parse(raw).layers },
      };
  } catch {
    /* sin almacenamiento */
  }
  return structuredClone(DEFAULTS);
}

export const getAudioSettings = () => settings;
export function onAudioSettings(fn: (s: AudioSettings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch, layers: { ...settings.layers, ...(patch.layers ?? {}) } };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sin almacenamiento */
  }
  applyGains();
  for (const fn of listeners) fn(settings);
}

function applyGains() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
  for (const [layer, g] of layerGain) g.gain.setTargetAtTime(settings.layers[layer], t, 0.05);
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const l of ["armas", "ambiente", "musica", "interfaz"] as Layer[]) {
      const g = ctx.createGain();
      g.connect(master);
      layerGain.set(l, g);
    }
    applyGains();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Llamar tras un gesto del usuario (los navegadores bloquean el audio hasta entonces). */
export function unlockAudio() {
  ac();
}

async function buffer(url: string): Promise<AudioBuffer | null> {
  if (buffers.has(url)) return buffers.get(url)!;
  const a = ac();
  if (!a) return null;
  let p = pending.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => a.decodeAudioData(b))
      .catch(() => null)
      .then((b) => {
        buffers.set(url, b);
        return b;
      });
    pending.set(url, p);
  }
  return p;
}

/** Precarga todos los ficheros (al abrir un duelo). */
export function preloadAudio() {
  for (const def of [...Object.values(SOUNDS), ...Object.values(LOOPS)])
    for (const f of def.files) void buffer(f);
}

export interface PlayOpts {
  delay?: number;
  gain?: number;
  rate?: number;
  /** −1 izquierda … 1 derecha. */
  pan?: number;
}

function out(a: AudioContext, layer: Layer, gain: number, pan = 0): AudioNode {
  const g = a.createGain();
  g.gain.value = gain;
  if (pan && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(layerGain.get(layer)!);
  } else g.connect(layerGain.get(layer)!);
  return g;
}

export function play(id: SoundId, opts: PlayOpts = {}) {
  const a = ac();
  if (!a || settings.muted) return;
  const def = SOUNDS[id];
  const when = a.currentTime + (opts.delay ?? 0);
  const gain = def.volume * (opts.gain ?? 1);
  if (!def.files.length) return synth(id, a, when, out(a, def.layer, gain, opts.pan));
  const file = def.files[Math.floor(Math.random() * def.files.length)]!;
  void buffer(file).then((b) => {
    if (!b) return synth(id, a, when, out(a, def.layer, gain, opts.pan));
    const src = a.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = (opts.rate ?? 1) * (0.92 + Math.random() * 0.16);
    src.connect(out(a, def.layer, gain, opts.pan));
    src.start(Math.max(when, a.currentTime));
  });
}

export function startLoop(id: LoopId, fade = 1.5) {
  const a = ac();
  if (!a || loops.has(id)) return;
  const def = LOOPS[id];
  const gain = a.createGain();
  gain.gain.value = 0;
  gain.connect(layerGain.get(def.layer)!);
  gain.gain.setTargetAtTime(def.volume, a.currentTime, fade / 3);
  if (def.files.length) {
    const file = def.files[Math.floor(Math.random() * def.files.length)]!;
    loops.set(id, { src: [], gain });
    void buffer(file).then((b) => {
      const entry = loops.get(id);
      if (!b || !entry) return;
      const src = a.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.connect(gain);
      src.start();
      entry.src = src;
    });
    return;
  }
  if (def.layer === "musica") return; // sin música sintética
  // Reserva: zumbido grave del reactor / puente.
  const oscs = [42, 63, 84.5].map((f, i) => {
    const o = a.createOscillator();
    o.type = i === 0 ? "sawtooth" : "sine";
    o.frequency.value = id === "reactor" ? f * 1.5 : f;
    const g = a.createGain();
    g.gain.value = i === 0 ? 0.05 : 0.12;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    o.connect(lp).connect(g).connect(gain);
    o.start();
    return o;
  });
  loops.set(id, { src: oscs, gain });
}

export function stopLoop(id: LoopId, fade = 1.2) {
  const a = ac();
  const l = loops.get(id);
  if (!a || !l) return;
  loops.delete(id);
  l.gain.gain.setTargetAtTime(0, a.currentTime, fade / 3);
  const stopAt = a.currentTime + fade + 0.2;
  if (Array.isArray(l.src)) for (const o of l.src) o.stop(stopAt);
  else l.src.stop(stopAt);
}

export function stopAllLoops() {
  for (const id of [...loops.keys()]) stopLoop(id);
}

// ───────────── Síntesis de reserva ─────────────

function noise(a: AudioContext, dur: number): AudioBufferSourceNode {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = b;
  return s;
}

function env(a: AudioContext, dest: AudioNode, t: number, attack: number, dur: number, peak = 1) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

function synth(id: SoundId, a: AudioContext, t: number, dest: AudioNode) {
  switch (id) {
    case "impacto_escudo": {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
      const f = a.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 600;
      f.Q.value = 6;
      o.connect(f).connect(env(a, dest, t, 0.01, 0.6, 0.5));
      o.start(t);
      o.stop(t + 0.7);
      return;
    }
    case "torpedo_lanzamiento":
    case "avante_toda": {
      const n = noise(a, 1.6);
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
      f.frequency.exponentialRampToValueAtTime(200, t + 1.5);
      n.connect(f).connect(env(a, dest, t, 0.05, 1.5, 0.7));
      n.start(t);
      return;
    }
    case "salto_disforme":
    case "salto_fallido":
    case "reactor_encendido": {
      const up = id !== "salto_fallido";
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(up ? 40 : 300, t);
      o.frequency.exponentialRampToValueAtTime(up ? 600 : 30, t + 2);
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      o.connect(f).connect(env(a, dest, t, 0.3, 2.4, 0.5));
      o.start(t);
      o.stop(t + 2.5);
      const n = noise(a, 2.5);
      const nf = a.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.setValueAtTime(200, t);
      nf.frequency.exponentialRampToValueAtTime(3000, t + 2.2);
      n.connect(nf).connect(env(a, dest, t, 0.5, 2.5, 0.4));
      n.start(t);
      return;
    }
    case "click": {
      const o = a.createOscillator();
      o.frequency.value = 1400;
      o.connect(env(a, dest, t, 0.002, 0.06, 0.3));
      o.start(t);
      o.stop(t + 0.08);
      return;
    }
    default: {
      // Explosión genérica: ruido filtrado + golpe grave.
      const n = noise(a, 1.4);
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(2500, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
      n.connect(f).connect(env(a, dest, t, 0.005, 1.3, 0.9));
      n.start(t);
      const o = a.createOscillator();
      o.frequency.setValueAtTime(80, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      o.connect(env(a, dest, t, 0.005, 0.9, 0.8));
      o.start(t);
      o.stop(t + 1);
    }
  }
}
