/**
 * Sonido del combate naval: grabaciones reales (dominio público / CC, Wikimedia Commons, ver public/sfx/CREDITS.md)
 * con un rumor grave sintetizado debajo para dar peso cinematográfico. Voz de ronda del navegador.
 */
let ctx: AudioContext | null = null;
export let muted = false;
export const setMuted = (m: boolean) => { muted = m; if (m) window.speechSynthesis?.cancel(); };

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const FILES = ["broadside", "impact", "alarm", "lance", "boarding", "engines", "guns"] as const;
type Sample = (typeof FILES)[number];
const buffers = new Map<Sample, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Precarga las grabaciones (se llama al abrir la repetición). */
export function preloadSfx() {
  const a = ac(); if (!a) return Promise.resolve();
  loading ??= Promise.all(FILES.map(async (f) => {
    try {
      const r = await fetch(`/sfx/${f}.mp3`);
      buffers.set(f, await a.decodeAudioData(await r.arrayBuffer()));
    } catch { /* sin sonido si falla */ }
  })).then(() => undefined);
  return loading;
}

function sample(name: Sample, { delay = 0, gain = 0.8, rate = 1 } = {}) {
  const a = ac(); if (!a || muted) return;
  const b = buffers.get(name);
  if (!b) { void preloadSfx(); return; }
  const src = a.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(g).connect(a.destination); src.start(a.currentTime + delay);
}

function rumble(dur: number, gain: number, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(28, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}

function hum(f0: number, f1: number, dur: number, gain: number) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}

export const sfx = {
  cannon: (n = 9) => { for (let i = 0; i < n; i++) { const d = (i % 3) * 0.18 + Math.floor(i / 3) * 0.55; sample("broadside", { delay: d, gain: 0.55, rate: 0.8 + Math.random() * 0.3 }); sample("impact", { delay: d + 0.5, gain: 0.35, rate: 1 + Math.random() * 0.3 }); } rumble(2.4, 0.35); },
  impact: () => { sample("impact", { gain: 0.9, rate: 0.85 }); rumble(1.2, 0.3); },
  shield: () => { hum(120, 420, 1.2, 0.18); sample("lance", { gain: 0.25, rate: 0.5 }); },
  lance: () => { sample("lance", { gain: 0.8, rate: 0.75 }); rumble(1.5, 0.25, 0.3); },
  boarding: () => { sample("engines", { gain: 0.5, rate: 1.4 }); sample("impact", { delay: 1.4, gain: 0.6 }); sample("boarding", { delay: 1.5, gain: 0.7 }); sample("guns", { delay: 1.9, gain: 0.6 }); },
  engines: () => { sample("engines", { gain: 0.85 }); rumble(4, 0.35, 0.3); },
  alarm: () => { sample("alarm", { gain: 0.7 }); rumble(5, 0.2); },
  ping: () => hum(1200, 1180, 0.25, 0.05),
};

export function say(text: string) {
  if (muted || typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES"; u.rate = 0.8; u.pitch = 0.4;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("es"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}
