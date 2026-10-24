import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAudioSettings,
  onAudioSettings,
  setAudioSettings,
  unlockAudio,
  type AudioSettings,
} from "@/lib/sfx/engine";
import type { Layer } from "@/lib/sfx/library";

const LAYERS: { id: Layer; label: string }[] = [
  { id: "armas", label: "Armas" },
  { id: "ambiente", label: "Ambiente" },
  { id: "musica", label: "Música" },
];

/** Silencio y volumen por capas (se recuerda en este navegador). */
export function SoundControls() {
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
        </div>
      )}
    </div>
  );
}
