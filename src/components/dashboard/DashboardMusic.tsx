import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const KEY = "dash-music-muted";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Música de fondo del dashboard en bucle, con botón para silenciarla (se recuerda en este navegador).
 * Los navegadores bloquean el audio hasta la primera interacción: si pasa, arranca al primer toque o tecla.
 */
export function DashboardMusic() {
  const ref = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMuted(read());
    setReady(true);
  }, []);

  useEffect(() => {
    const a = ref.current;
    if (!a || !ready) return;
    a.volume = 0.45;
    a.muted = muted;
    try {
      localStorage.setItem(KEY, muted ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
    if (muted) return;
    const start = () => {
      a.play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    };
    start();
    const unlock = () => start();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [muted, ready]);

  return (
    <>
      <audio ref={ref} src="/sfx/musica/dashboard.mp3" loop preload="auto" />
      <button
        type="button"
        className={`border border-primary/40 p-2 text-primary ${blocked && !muted ? "animate-pulse" : "dash-tool"}`}
        aria-pressed={muted}
        aria-label={muted ? "Activar música" : "Silenciar música"}
        title={
          blocked && !muted
            ? "Toca para empezar la música"
            : muted
              ? "Activar música"
              : "Silenciar música"
        }
        onClick={() => setMuted((m) => !m)}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </>
  );
}
