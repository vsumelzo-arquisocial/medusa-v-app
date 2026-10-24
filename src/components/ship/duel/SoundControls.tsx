import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { profileQuery } from "@/lib/profile";
import {
  MUSIC_FILES,
  campaignMusicExists,
  installCampaignMusic,
  uploadCampaignMusic,
} from "@/lib/sfx/campaign-music";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAudioSettings,
  onAudioSettings,
  setAudioSettings,
  unlockAudio,
  type AudioSettings,
  customMusicName,
  setCustomMusic,
  type MusicSlot,
} from "@/lib/sfx/engine";
import type { Layer } from "@/lib/sfx/library";

const LAYERS: { id: Layer; label: string }[] = [
  { id: "armas", label: "Armas" },
  { id: "ambiente", label: "Ambiente" },
  { id: "musica", label: "Música" },
];

/** Silencio y volumen por capas (se recuerda en este navegador). */
export function SoundControls() {
  const { data: profile } = useQuery(profileQuery);
  const isAdmin = !!profile?.isAdmin;
  useEffect(() => installCampaignMusic(), []);
  const [s, setS] = useState<AudioSettings>(getAudioSettings);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const off = onAudioSettings(setS);
    return () => void off();
  }, []);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-label="Sonido"
        onClick={() => {
          unlockAudio();
          setOpen((o) => !o);
        }}
      >
        {s.muted ? <VolumeX /> : <Volume2 />}
        Sonido
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 space-y-2 rounded border border-border bg-background p-3 shadow-lg">
          <label className="flex items-center justify-between text-sm">
            Silenciar
            <input
              type="checkbox"
              checked={s.muted}
              onChange={(e) => setAudioSettings({ muted: e.target.checked })}
            />
          </label>
          {LAYERS.map((l) => (
            <label key={l.id} className="block text-xs">
              <span className="flex justify-between">
                {l.label} <span className="tabular-nums">{Math.round(s.layers[l.id] * 100)} %</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.layers[l.id]}
                className="w-full accent-current"
                onChange={(e) =>
                  setAudioSettings({ layers: { ...s.layers, [l.id]: Number(e.target.value) } })
                }
              />
            </label>
          ))}
          <div className="space-y-2 border-t border-border pt-2 text-xs">
            <p className="text-muted-foreground">Tu propia música (solo en este navegador)</p>
            <MusicPicker slot="musica_tension" label="Aproximación" open={open} />
            <MusicPicker slot="musica_combate" label="Combate" open={open} />
            <p className="text-[10px] text-muted-foreground">
              Se guarda en tu navegador y sustituye a la de la campaña solo para ti.
            </p>
            {isAdmin && <CampaignMusicAdmin />}
          </div>
        </div>
      )}
    </div>
  );
}

function MusicPicker({ slot, label, open }: { slot: MusicSlot; label: string; open: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) void customMusicName(slot).then(setName);
  }, [open, slot]);
  return (
    <div>
      <p>
        {label}: <span className="text-primary">{name ?? "la de la app"}</span>
      </p>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void setCustomMusic(f, slot).then(() => setName(f.name));
        }}
      />
      <div className="mt-0.5 flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => input.current?.click()}
        >
          Elegir archivo
        </Button>
        {name && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => void setCustomMusic(null, slot).then(() => setName(null))}
          >
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Administradores: música de la campaña para todos los jugadores aprobados (bucket privado). */
function CampaignMusicAdmin() {
  return (
    <div className="space-y-2 border-t border-amber-500/40 pt-2">
      <p className="text-amber-300">Música de la campaña (para todos los jugadores aprobados)</p>
      <CampaignSlot slot="musica_tension" label="Aproximación" />
      <CampaignSlot slot="musica_combate" label="Combate" />
    </div>
  );
}

function CampaignSlot({ slot, label }: { slot: MusicSlot; label: string }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void campaignMusicExists(slot).then(setHas);
  }, [slot]);
  return (
    <div>
      <p>
        {label}:{" "}
        <span className="text-primary">
          {has ? MUSIC_FILES[slot] : has === false ? "sin subir" : "…"}
        </span>
      </p>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          uploadCampaignMusic(slot, f)
            .then(() => {
              setHas(true);
              toast.success(`Música de ${label.toLowerCase()} subida`);
            })
            .catch((err: Error) => toast.error(`No se pudo subir: ${err.message}`))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="mt-0.5 h-7 px-2 text-[11px]"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Subiendo…" : has ? "Reemplazar" : "Subir"}
      </Button>
    </div>
  );
}
