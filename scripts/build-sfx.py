"""Construye la biblioteca de sonido de Atalaya a partir del Sonniss GDC 2026 (parte 9) y otros ficheros del usuario."""
import subprocess, numpy as np, os, json, sys
SR = 44100
SRC = "/mnt/user-data/uploads/Medusa-V/atalaya-sonidos/"
E = SRC + "efectos/"
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
manifest = {}

def load(path, rate=1.0):
    """Estéreo float32 a 44,1 kHz. rate<1 baja el tono (y alarga)."""
    af = f"asetrate={SR}*{rate},aresample={SR}" if rate != 1 else f"aresample={SR}"
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-af", af, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    assert len(x), path
    return x

def cut(x, a, b=None):
    return x[int(a * SR): None if b is None else int(b * SR)].copy()

def fade(x, fin=0.005, fout=0.3):
    n = len(x)
    i = min(n, int(fin * SR)); o = min(n, int(fout * SR))
    if i: x[:i] *= np.linspace(0, 1, i)[:, None]
    if o: x[-o:] *= (np.linspace(1, 0, o) ** 2)[:, None]
    return x

def mix(*parts, length=None):
    """parts: (array, offset_s, gain)."""
    end = max(int(o * SR) + len(a) for a, o, g in parts)
    y = np.zeros((length and int(length * SR) or end, 2), np.float32)
    for a, o, g in parts:
        s = int(o * SR); e = min(len(y), s + len(a))
        y[s:e] += a[: e - s] * g
    return y

def peak(x, db=-1.0):
    m = np.abs(x).max() or 1
    return x * (10 ** (db / 20) / m)

def rms_norm(x, db):
    r = np.sqrt((x ** 2).mean()) or 1
    y = x * (10 ** (db / 20) / r)
    m = np.abs(y).max()
    return y / m * 0.89 if m > 0.89 else y

def loop(x, xf=2.0):
    """Bucle sin costura: el final se funde con el principio."""
    n = int(xf * SR)
    head, body, tail = x[:n], x[n:-n] if len(x) > 3 * n else x[n:], x[-n:]
    t = np.linspace(0, 1, n)[:, None]
    seam = tail * np.cos(t * np.pi / 2) + head * np.sin(t * np.pi / 2)
    return np.concatenate([body, seam])

def trim_onset(x, rel_db=-35):
    """Quita el silencio inicial para que el sonido arranque justo con el efecto visual."""
    a = np.abs(x).max(1)
    th = a.max() * 10 ** (rel_db / 20)
    i = int(np.argmax(a > th))
    return x[max(0, i - int(0.008 * SR)):]

def save(slot, x, mono=True, br="96k", layer="armas", vol=1.0, is_loop=False):
    if not is_loop:
        x = trim_onset(x)
    idx = len(manifest.setdefault(slot, {"files": [], "layer": layer, "volume": vol, "loop": is_loop})["files"]) + 1
    name = f"{slot}_{idx}.mp3"
    data = x.mean(1, keepdims=True) if mono else x
    ch = 1 if mono else 2
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-", "-codec:a", "libmp3lame", "-b:a", br, os.path.join(OUT, name)], input=data.astype(np.float32).tobytes(), check=True)
    manifest[slot]["files"].append("/sfx/lib/" + name)
    print(f"{name:32s} {len(x)/SR:5.1f}s {os.path.getsize(os.path.join(OUT, name))//1024} KB")

booms = {k: load(E + f"Federico Soler - Effective Trailer Booms Vol. 2/EffectiveTrailer_Booms_Vol2_{k}.wav") for k in ("011", "075", "214")}
bass = lambda n: load(E + "344 Audio - Bass Drops & Downers Vol. " + n)
elec = load(E + "Epic Stock Media - Elemental Mutation Whooshes and Impacts/ELECMisc_Impact Electric Tonal Deep Movement Motion Hiss Glitch 01_ESM_EMWI.wav")
arc15 = load(E + "InMotionAudio - Arc/ELECArc_ArcDesign15_InMotionAudio_Arc.wav")
arcup = load(E + "InMotionAudio - Arc/ELECArc_ArcPowerUpDesign04_InMotionAudio_Arc.wav")
metal_thud = load(E + "The Noisery - Moaning Metal/DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav")
metal_hit = load(E + "David Dumais Audio - Melee Weapons Sound Effects Pack 2/METLImpt_METAL SWING HIT Weapon Swing To Metallic Body Impact And Resonant Tail 01_DDUMAIS_MWP2.wav")
scrape = load(E + "The Noisery - Moaning Metal/DSGNTonl_Metal Scrape Low Tonal LFE 4_The Noisery_Moaning Metal.wav")
screech = load(E + "The Noisery - Moaning Metal/DSGNTonl_Designed Metal Bowed Screech Tonal Reverb 7_The Noisery_Moaning Metal.wav")
noisebox36 = load(E + "InMotionAudio - Sinister Textures 4/DSGNErie_NoiseBoxHit_36_InMotionAudio_SinisterTextures4.wav")
noisebox10 = load(E + "InMotionAudio - Sinister Textures 4/DSGNErie_NoiseBoxHit_10_InMotionAudio_SinisterTextures4.wav")
whoosh_fire = load(E + "Epic Stock Media - Elemental Mutation Whooshes and Impacts/FIREWhsh_Whoosh Fire Deep Growl Monster Saturated Crisp 03_ESM_EMWI.wav")
zap = load(SRC + "macrocanon/719426__zapsplatcom__missile-or-bomb-incoming-whoosh-and-explosion.wav")
jet = load(E + "344 Audio - Air Designed/AEROJet_Unidentified Encounter_344 Audio_Air Designed.wav")
braam_t = load(E + "Cinematic Sound Design - Ultra Transitions & Impacts/Transition Braam Slow Dark Creepy.wav")
astral = load(E + "Alexander Kopeikin - Emotion and Magic/magic, energy flow, astral travel-015.wav")
glitch = load(E + "The Noisery - Rich Glitch/UIGlitch_Designed_Glitch_Corrupted_Data Error_The Noisery_Rich Glitch_06.wav")
alarm_half = load(E + "Federico Soler - Effective Trailer Alarms Vol. 2/EffectiveTrailer_Alarms_Vol2_HalfNotes_003.wav")
alarm_whole = load(E + "Federico Soler - Effective Trailer Alarms Vol. 2/EffectiveTrailer_Alarms_Vol2_WholeNotes_011.wav")
servo = load(E + "Epic Stock Media - Tower Defense Game/ROBTMvmt_Tower Deploy Hitech Robot Motor Dark Thump Servo Whine 04_ESM_TDG.wav")
horn32 = load(E + "Jake Fielding - Cinematic Horn Braams/DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-32.wav")
horn67 = load(E + "Jake Fielding - Cinematic Horn Braams/DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-67.wav")
radar = load(E + "411572__enviromaniac2__target-on-radar.mp3")
ui = lambda p: load(E + p)

# ── Armas ──
save("macrocanon", peak(fade(cut(booms["075"], 0, 5.0), fout=1.2)))
save("macrocanon", peak(fade(cut(booms["214"], 0, 5.5), fout=1.5)))
save("macrocanon", peak(fade(cut(booms["011"], 0, 5.5), fout=1.5)))
save("macrocanon", peak(fade(mix((cut(booms["075"], 0, 4), 0, 1), (cut(metal_thud, 0, 3), 0.05, 0.5)), fout=1.0)))
save("lanza", peak(fade(mix((cut(elec, 0, 3.0), 0, 1), (arc15, 0.03, 0.8)), fout=0.8)))
save("lanza", peak(fade(mix((cut(arcup, 4.5, 7.3), 0, 0.7), (cut(elec, 0, 2.8), 0.15, 1)), fout=0.6)))
save("lanza", peak(fade(mix((cut(load(E + "Epic Stock Media - Elemental Mutation Whooshes and Impacts/ELECMisc_Impact Electric Tonal Deep Movement Motion Hiss Glitch 01_ESM_EMWI.wav", 0.8), 0, 3.2), 0, 1), (arc15, 0, 0.6)), fout=0.8)))
save("torpedo_lanzamiento", peak(fade(cut(whoosh_fire, 0, 2.2), fout=0.8), -3))
save("torpedo_lanzamiento", peak(fade(cut(load(E + "Epic Stock Media - Elemental Mutation Whooshes and Impacts/FIREWhsh_Whoosh Fire Deep Growl Monster Saturated Crisp 03_ESM_EMWI.wav", 0.8), 0, 2.6), fout=0.9), -3))
save("torpedo_impacto", peak(fade(cut(zap, 0, 5.0), fout=1.5)))
save("torpedo_impacto", peak(fade(cut(bass("1/DSGNBass_Bass Drop & Downer Medium 04_344 Audio_Bass Drops & Downers.wav"), 0, 4.0), fout=1.2)))
save("torpedo_impacto", peak(fade(mix((cut(booms["214"], 0, 3.0), 0, 1), (cut(noisebox36, 0, 2.5), 0.02, 0.4)), fout=1.0)))
save("impacto_casco", peak(fade(cut(metal_thud, 0, 3.5), fout=1.2), -2))
save("impacto_casco", peak(fade(cut(metal_hit, 0, 2.2), fout=0.8), -2))
save("impacto_casco", peak(fade(cut(noisebox36, 0, 3.5), fout=1.4), -2))
save("impacto_casco", peak(fade(mix((cut(metal_thud, 0, 3), 0, 1), (cut(metal_hit, 0.0, 2), 0.02, 0.6)), fout=1.0), -2))
save("impacto_escudo", peak(fade(cut(elec, 0, 2.2), fout=0.8), -3))
save("impacto_escudo", peak(fade(mix((arc15, 0, 1), (cut(load(E + "Epic Stock Media - Elemental Mutation Whooshes and Impacts/ELECMisc_Impact Electric Tonal Deep Movement Motion Hiss Glitch 01_ESM_EMWI.wav", 1.25), 0, 1.6), 0.02, 0.6)), fout=0.5), -3))
save("explosion_grande", peak(fade(mix((cut(booms["214"], 0, 8), 0, 1), (cut(bass("1/DSGNBass_Bass Drop & Downer Slow 10_344 Audio_Bass Drops & Downers.wav"), 0, 7), 0.05, 0.8), (cut(screech, 0, 6), 0.8, 0.25)), fout=2.5)))
save("explosion_grande", peak(fade(mix((cut(booms["011"], 0, 8), 0, 1), (cut(bass("3/DSGNBass_Rattling Downer 3_344 Audio_Bass Drops and Downers Vol 3.wav"), 0, 5.5), 0.1, 0.8), (cut(zap, 0, 5), 0.3, 0.5)), fout=2.5)))
save("embestida", peak(fade(mix((cut(booms["075"], 0, 4), 0, 0.9), (cut(scrape, 0.2, 5.2), 0.1, 1.0), (cut(metal_hit, 0, 2), 0, 0.7)), fout=1.5)))
save("embestida", peak(fade(mix((cut(screech, 0, 5.5), 0.15, 0.8), (cut(metal_thud, 0, 3.5), 0, 1), (cut(booms["214"], 0, 3), 0, 0.6)), fout=1.8)))
# avante toda: tramo más intenso del reactor del caza
w = int(0.5 * SR); env = np.array([np.sqrt((jet[i:i + w] ** 2).mean()) for i in range(0, len(jet) - 3 * SR, w)])
s = int(np.argmax(env)) * 0.5
save("avante_toda", peak(fade(mix((cut(jet, max(0, s - 1), s + 2.5), 0, 1), (cut(bass("3/DSGNBass_Jump Start Drop 3_344 Audio_Bass Drops and Downers Vol 3.wav"), 0, 3.2), 0, 0.6)), fin=0.3, fout=1.2), -3))
save("salto_disforme", peak(fade(mix((cut(braam_t, 0, 4.0), 0, 1), (cut(astral, 3, 7), 0, 0.7), (cut(bass("3/DSGNBass_Tone Downer (Reverb)_344 Audio_Bass Drops and Downers Vol 3.wav"), 0, 4.5), 2.2, 0.7)), fin=0.2, fout=1.5)))
save("salto_disforme", peak(fade(mix((cut(noisebox10, 0, 6.5), 0, 1), (cut(astral, 10, 14), 0, 0.5)), fin=0.1, fout=1.5)))
save("salto_fallido", peak(fade(mix((cut(braam_t, 0, 2.5), 0, 0.8), (cut(glitch, 0, 3), 1.0, 1.2), (cut(bass("3/DSGNBass_Rattling Downer 3_344 Audio_Bass Drops and Downers Vol 3.wav"), 0, 4.5), 1.4, 0.9)), fout=1.2)))
# ── Ambiente ──
save("alarma", peak(fade(cut(alarm_whole, 0, 1.6), fout=0.4), -4), layer="ambiente")
save("alarma", peak(fade(cut(alarm_half, 0, 3.0), fout=0.6), -4), layer="ambiente")
save("reactor_encendido", peak(fade(mix((servo, 0, 0.9), (cut(arcup, 0, 7.2), 0.2, 1)), fout=1.5), -3), layer="ambiente")
save("inicio_combate", peak(fade(cut(horn32, 0, 9.5), fout=2.5), -2), layer="musica")
save("inicio_combate", peak(fade(cut(horn67, 0, 8.5), fout=2.5), -2), layer="musica")
# ── Interfaz ──
r0 = cut(radar, 0.25, 1.6)
save("radar_ping", peak(fade(r0, fout=0.6), -6), layer="interfaz")
save("click", peak(fade(cut(ui("Cinematic Sound Design - Interface & Infographics/Interface Percussion Snap.wav"), 0, 0.5), fout=0.2), -8), layer="interfaz")
save("click", peak(fade(cut(ui("Cinematic Sound Design - System & UI Feedback Elements/Interface Sci-Fi Ping Down.wav"), 0, 0.6), fout=0.2), -10), layer="interfaz")
save("aviso", peak(fade(cut(ui("Cinematic Sound Design - System & UI Feedback Elements/Interface Arp Reveal Down Long.wav"), 0, 1.0), fout=0.3), -8), layer="interfaz")
save("denegar", peak(fade(cut(ui("Cinematic Sound Design - System & UI Feedback Elements/Interface Deny Low Fat Dark.wav"), 0, 0.6), fout=0.2), -8), layer="interfaz")
save("registro", peak(fade(cut(ui("Cinematic Sound Design - User Interface/Readout Thin Long.wav"), 0, 1.4), fout=0.4), -12), layer="interfaz")

# ── Bucles ──
room = load(E + "Cinematic Sound Design - Sci-Fi Drones/Roomtone Space Ship Interior Muted.wav")
save("puente", rms_norm(loop(cut(room, 2, 64), 3), -24), mono=False, br="112k", layer="ambiente", is_loop=True)
indus = load(E + "Cinematic Sound Design - Sci-Fi Drones/Dark Industrial Ambience.wav")
save("puente", rms_norm(loop(cut(indus, 0.5, 30.5), 3), -26), mono=False, br="112k", layer="ambiente", is_loop=True)
reactor = load(E + "Epic Stock Media - Strange Game Ambient Loops 3/DSGNSynth_Scifi Loop Ship Reactor Synth Layer Layered Saw Buzz_ESM_SGA3.wav")
save("reactor", rms_norm(loop(cut(reactor, 0, 40), 2), -24), mono=False, br="112k", layer="ambiente", is_loop=True)
drone = load(E + "Alexander Kopeikin - Emotion and Magic/magic, drone, tension, spellbound, evanescence-002.wav")
save("musica_tension", rms_norm(loop(cut(drone, 1, 58), 4), -22), mono=False, br="128k", layer="musica", is_loop=True)

# Música de combate original: tambores de guerra (booms) a 66 ppm sobre drones y braams.
bpm = 66; beat = 60 / bpm; bars = 16; length = bars * 4 * beat
factory = load(E + "Epic Stock Media - Strange Game Ambient Loops 3/AMBRoom_Factory Loop Heavy Machinery Tonal Roomtone Dark Wind Vent_ESM_SGA3.wav")
whistle = load(E + "InMotionAudio - The Death Whistle/CREAEthr_Aztec Death Whistle Drone_05_IMA_Death Whistle Samples.wav", 0.7)
bed = [(rms_norm(cut(np.tile(drone, (2, 1)), 0, length), -20), 0, 0.5), (rms_norm(cut(np.tile(factory, (2, 1)), 0, length), -26), 0, 0.6)]
kick = peak(fade(cut(booms["075"], 0, 2.2), fout=0.9))
kick2 = peak(fade(cut(booms["214"], 0, 2.2), fout=0.9))
metal = peak(fade(cut(metal_thud, 0, 1.5), fout=0.6))
parts = list(bed)
for b in range(bars):
    t0 = b * 4 * beat
    parts += [(kick, t0, 1.0), (kick2, t0 + 2.5 * beat, 0.6)]
    if b % 2 == 1: parts += [(kick, t0 + 3 * beat, 0.5), (kick2, t0 + 3.5 * beat, 0.5)]
    if b % 4 == 3: parts += [(metal, t0 + 3.75 * beat, 0.25)]
parts += [(peak(fade(cut(horn32, 0, 9), fout=3)), 0, 0.35), (peak(fade(cut(horn67, 0, 8), fout=3)), 8 * 4 * beat, 0.35)]
parts += [(rms_norm(fade(cut(whistle, 0, 16), fin=3, fout=4), -30), 4 * 4 * beat, 1.0), (rms_norm(fade(cut(whistle, 4, 20), fin=3, fout=4), -30), 12 * 4 * beat, 1.0)]
music = mix(*parts, length=length + 2)
# cola de la última barra sobre el principio para que el bucle no se note
tail = music[int(length * SR):]
music = music[: int(length * SR)]
music[: len(tail)] += tail
save("musica_combate", rms_norm(music, -19), mono=False, br="128k", layer="musica", is_loop=True)

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("total KB", sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) // 1024)
