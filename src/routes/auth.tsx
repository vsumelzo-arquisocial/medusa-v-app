import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Brand, Panel, ThemeToggle } from "@/components/Terminal";
import { isSecurePassword, PASSWORD_REQUIREMENTS } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — Atalaya Legions Imperialis" },
      { name: "description", content: "Entra con tu correo o Google en Atalaya Legions Imperialis." },
      { property: "og:title", content: "Acceso — Atalaya Legions Imperialis" },
      { property: "og:description", content: "Identifícate ante la noosfera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const field = "w-full border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-primary";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "up" && !isSecurePassword(password)) {
      toast.error(PASSWORD_REQUIREMENTS);
      return;
    }
    setBusy(true);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/puente" });
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error("No se pudo entrar con Google"); return; }
    if (r.redirected) return;
    navigate({ to: "/puente" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><Brand /></div>
        <Panel title={mode === "in" ? "Identificación" : "Nuevo registro"}>
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-xs uppercase text-muted-foreground">Correo
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>
            <label className="block text-xs uppercase text-muted-foreground">Clave de acceso
              <input type="password" required minLength={mode === "up" ? 10 : undefined} autoComplete={mode === "up" ? "new-password" : "current-password"} aria-describedby={mode === "up" ? "password-requirements" : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
            {mode === "up" && <p id="password-requirements" className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p>}
            <Button disabled={busy} type="submit" className="w-full uppercase">
              {busy ? "Procesando…" : mode === "in" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>
          <div className="my-4 text-center text-xs text-muted-foreground">— o —</div>
          <Button variant="outline" onClick={google} className="w-full uppercase text-primary">
            Continuar con Google
          </Button>
          <Button variant="link" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-xs text-muted-foreground underline">
            {mode === "in" ? "¿Sin cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
          </Button>
        </Panel>
        <p className="text-center text-xs text-muted-foreground">&gt; Las cuentas nuevas deben ser aprobadas por un administrador del club.</p>
      </div>
    </main>
  );
}
