import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/Terminal";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/atalaya-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atalaya Warhammer 40.000 — Campaña de Medusa V" },
      {
        name: "description",
        content: "Ejércitos de Warhammer 40.000, naves raciales y campaña del club Atalaya Vigía.",
      },
      { property: "og:title", content: "Atalaya Warhammer 40.000 — Medusa V" },
      {
        property: "og:description",
        content: "Elige tu facción, comanda tu nave y conquista Medusa V.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <img src={logo} alt="Atalaya Vigía" className="w-64 sm:w-80" />
      <h1 className="mt-6 text-center text-3xl text-primary glow sm:text-5xl">ATALAYA</h1>
      <p className="mt-2 text-center text-sm uppercase tracking-[0.4em] text-muted-foreground">
        Legions Imperialis
      </p>
      <p className="mt-8 max-w-lg text-center text-sm">
        &gt; Medusa V arde. Jura lealtad, toma el mando de tu nave en órbita y lleva a tus legiones
        a la gloria… o a la condenación.
      </p>
      <Link
        to={signedIn ? "/puente" : "/auth"}
        className="mt-10 border border-primary px-8 py-3 uppercase tracking-widest text-primary glow-box hover:bg-primary hover:text-primary-foreground"
      >
        {signedIn ? "Ir al puente de mando" : "Acceder a la noosfera"}
      </Link>
      <Link
        to="/dashboard"
        className="mt-4 border border-border px-8 py-3 text-sm uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
      >
        Entrar al dashboard
      </Link>
    </main>
  );
}
