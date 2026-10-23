import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";
import logo from "@/assets/atalaya-logo.png";
import { useQuery } from '@tanstack/react-query';
import { profileQuery } from '@/lib/profile';
import { factionAtmosphere } from '@/lib/faction-atmosphere';

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-border bg-card/70 p-5 glow-box ${className}`}>
      {title && <h2 className="mb-4 border-b border-border pb-2 text-sm uppercase text-primary glow">▣ {title}</h2>}
      {children}
    </section>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("atalaya-theme", next ? "light" : "dark");
  };
  return (
    <button onClick={toggle} aria-label="Cambiar modo" className="border border-border p-2 text-primary hover:bg-accent">
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="Atalaya Vigía" className={small ? "h-10 w-10" : "h-14 w-14"} />
      <div className="leading-tight">
        <div className="font-display text-sm text-primary glow">ATALAYA</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Warhammer 40.000</div>
      </div>
    </div>
  );
}

const LOG_LINES = [
  "> INICIANDO NOOSFERA ATALAYA-VIGÍA ...",
  "> CONECTANDO CON FORJA MARCIANA [OLYMPUS MONS] ... OK",
  "> CARGANDO CATECISMOS DE LA MÁQUINA ... OK",
  "> SINCRONIZANDO CARTOGRAFÍA DE MEDUSA V ... OK",
  "> VERIFICANDO SELLOS DE PUREZA DEL ESPÍRITU-MÁQUINA ... OK",
  "> DESCIFRANDO REGISTROS DE LA HEREJÍA ... OK",
];

export function MatrixBoot({ onDone }: { onDone: () => void }) {
  const {data}=useQuery({...profileQuery,retry:false});
  const p=data?.profile;const identity=factionAtmosphere(p?.army_race,p?.army_faction,p?.army_variant);
  const messages=p?.army_faction?["> INICIANDO ENLACE ATALAYA ...",`> ${identity.motto.toUpperCase()} ...`,"> SINCRONIZANDO SISTEMAS DE LA FLOTA ... OK","> CARGANDO CARTOGRAFÍA DE MEDUSA V ... OK","> VERIFICANDO TELEMETRÍA ... OK","> ENLACE ESTABLECIDO ... OK"]:LOG_LINES;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [lines, setLines] = useState(0);
  const [gloria, setGloria] = useState(false);

  useEffect(() => {
    const c = canvas.current;if(!c)return;
    const ctx = c.getContext("2d");if(!ctx)return;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const chars = "01ΩΣΔ⚙☩アカサタナハマヤラワ0110";
    const size = 16;
    let drops = Array(Math.ceil(c.width / size)).fill(0).map(() => Math.random() * -50);
    const id = setInterval(() => {
      const color=getComputedStyle(document.documentElement).getPropertyValue('--primary');
      const bg=getComputedStyle(document.documentElement).getPropertyValue('--background');
      ctx.globalAlpha = 0.12; ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = `${size}px monospace`;
      drops = drops.map((y, i) => {
        ctx.fillText(chars.charAt(Math.floor(Math.random() * chars.length)), i * size, y * size);
        return y * size > c.height && Math.random() > 0.975 ? 0 : y + 1;
      });
    }, 45);
    const t = LOG_LINES.map((_, i) => setTimeout(() => setLines(i + 1), 350 + i * 380));
    const g = setTimeout(() => setGloria(true), 350 + LOG_LINES.length * 380 + 200);
    const d = setTimeout(onDone, 350 + LOG_LINES.length * 380 + 200 + 2000);
    return () => { clearInterval(id); [...t, g, d].forEach(clearTimeout); window.removeEventListener("resize", resize); };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <canvas ref={canvas} className="absolute inset-0 opacity-40" />
      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-6">
        <div className="w-full max-w-xl border border-border bg-background/85 p-5 text-xs sm:text-sm glow-box">
          {messages.slice(0, lines).map((l) => <div key={l} className="glow">{l}</div>)}
          {!gloria && <span className="caret-blink">█</span>}
        </div>
        {gloria && (
          <h1 className="animate-in fade-in zoom-in-95 duration-1000 text-center font-display text-3xl text-primary glow sm:text-5xl">
            {p?.army_faction?identity.motto:'ATALAYA VIGÍA'}
          </h1>
        )}
      </div>
    </div>
  );
}
