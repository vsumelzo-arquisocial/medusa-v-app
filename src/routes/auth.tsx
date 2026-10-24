import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Brand, Panel, ThemeToggle } from "@/components/Terminal";
import { isSecurePassword, PASSWORD_REQUIREMENTS } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — Atalaya Legions Imperialis" },
      { name: "description", content: "Entra con tu correo en Atalaya Legions Imperialis." },
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
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Si el correo existe, recibirás un enlace para fijar una nueva clave.");
      setMode("in");
      return;
    }
    if (mode === "reset") {
      if (!isSecurePassword(password)) { toast.error(PASSWORD_REQUIREMENTS); return; }
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Clave actualizada.");
      navigate({ to: "/puente" });
      return;
    }
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

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><Brand /></div>
        <Panel title={{ in: "Identificación", up: "Nuevo registro", forgot: "Recuperar acceso", reset: "Nueva clave" }[mode]}>
          <form onSubmit={submit} className="space-y-4">
            {mode !== "reset" && <label className="block text-xs uppercase text-muted-foreground">Correo
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>}
            {mode !== "forgot" && <label className="block text-xs uppercase text-muted-foreground">Clave de acceso
              <input type="password" required minLength={mode === "in" ? undefined : 10} autoComplete={mode === "in" ? "current-password" : "new-password"} aria-describedby={mode === "in" ? undefined : "password-requirements"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>}
            {(mode === "up" || mode === "reset") && <p id="password-requirements" className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p>}
            <Button disabled={busy} type="submit" className="w-full uppercase">
              {busy ? "Procesando…" : { in: "Entrar", up: "Crear cuenta", forgot: "Enviar enlace", reset: "Guardar clave" }[mode]}
            </Button>
          </form>
          {mode === "in" && (
            <Button variant="link" onClick={() => setMode("forgot")} className="mt-4 w-full text-xs text-muted-foreground underline">
              ¿Olvidaste tu clave?
            </Button>
          )}
          {mode !== "reset" && (
            <Button variant="link" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-xs text-muted-foreground underline">
              {mode === "in" ? "¿Sin cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
            </Button>
          )}
        </Panel>
        <Button asChild variant="outline" className="w-full uppercase tracking-widest">
          <Link to="/dashboard">Entrar al dashboard</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">&gt; Las cuentas nuevas deben ser aprobadas por un administrador del club.</p>
      </div>
    </main>
  );
}
