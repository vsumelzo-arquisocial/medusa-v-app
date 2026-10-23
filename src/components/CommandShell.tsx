import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Menu, X, Smartphone, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand, ThemeToggle } from "@/components/Terminal";
import { useViewMode } from "@/hooks/use-view-mode";
import { profileQuery } from '@/lib/profile';
import { factionAtmosphere } from '@/lib/faction-atmosphere';

const LINKS = [
  ["/puente", "Puente"], ["/sistema", "Sistema"], ["/estrategos", "Estrategos"], ["/logros", "Logros"],
  ["/nave", "Nave"], ["/mando", "Mando"], ["/listas", "Listas"], ["/partidas", "Partidas"], ["/reclutar", "Reclutamiento"], ["/unidades", "Unidades"], ["/facciones", "Facciones"], ["/perfil", "Perfil"],
] as const;

function ViewToggle() {
  const { compact, setMode } = useViewMode();
  return (
    <button
      onClick={() => setMode(compact ? "full" : "compact")}
      aria-label={compact ? "Cambiar a versión completa (PC)" : "Cambiar a versión compacta (móvil)"}
      title={compact ? "Versión completa (PC)" : "Versión compacta (móvil)"}
      className="flex items-center gap-1 border border-border p-2 text-primary hover:bg-accent"
    >
      {compact ? <Monitor size={16} /> : <Smartphone size={16} />}
    </button>
  );
}

export function CommandShell({ children, isAdmin }: { children: ReactNode; isAdmin?: boolean }) {
  const qc = useQueryClient();
  const {data:army}=useQuery(profileQuery);
  const identity=factionAtmosphere(army?.profile?.army_race,army?.profile?.army_faction,army?.profile?.army_variant);
  const crest=<div className="flex min-w-0 items-center gap-2">{identity.emblem&&<img src={identity.emblem} alt="Emblema de tu facción" width={512} height={512} className="h-9 w-9 object-contain"/>}<span className="faction-motto text-xs text-primary">{identity.motto}</span></div>;
  const navigate = useNavigate();
  const { compact } = useViewMode();
  const [open, setOpen] = useState(false);
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const links = [...LINKS, ...(isAdmin ? ([["/admin", "Admin"]] as const) : [])];
  const cls = "text-muted-foreground hover:text-primary";
  const active = { className: "text-primary glow" };

  if (compact) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
            <Link to="/puente" className="min-w-0">{crest}</Link>
            <div className="flex shrink-0 items-center gap-2">
              <ViewToggle />
              <ThemeToggle />
              <button onClick={() => setOpen((o) => !o)} aria-label="Menú" className="border border-border p-2 text-primary">
                {open ? <X size={16} /> : <Menu size={16} />}
              </button>
            </div>
          </div>
          {open && (
            <nav className="grid grid-cols-2 gap-1 border-t border-border p-2 text-xs uppercase">
              {links.map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setOpen(false)} className={`border border-border px-3 py-3 ${cls}`} activeProps={active}>{label}</Link>
              ))}
              <button onClick={signOut} className="col-span-2 border border-border px-3 py-3 uppercase hover:bg-accent">Salir</button>
            </nav>
          )}
        </header>
        <main className="mx-auto max-w-5xl p-3">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link to="/puente" className="max-w-52">{crest}</Link>
        <nav className="flex items-center gap-3 text-xs uppercase">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className={cls} activeProps={active}>{label}</Link>
          ))}
          <ViewToggle />
          <ThemeToggle />
          <button onClick={signOut} className="border border-border px-3 py-2 hover:bg-accent">Salir</button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
