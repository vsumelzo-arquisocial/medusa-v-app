import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MatrixBoot } from "@/components/Terminal";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { PlayerHelp } from "@/components/PlayerHelp";
import { FactionAtmosphere } from '@/components/FactionAtmosphere';

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl text-primary glow">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">&gt; SECTOR NO CARTOGRAFIADO</p>
        <Link to="/" className="mt-6 inline-block border border-primary px-4 py-2 text-primary hover:bg-accent">
          VOLVER
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl text-destructive">FALLO DEL ESPÍRITU-MÁQUINA</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo ha ido mal. Reintenta el rito.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 border border-primary px-4 py-2 text-primary hover:bg-accent"
        >
          REINTENTAR
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Atalaya Legions Imperialis" },
      { name: "description", content: "Campaña de Legions Imperialis del club Atalaya Vigía en Medusa V." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Share+Tech+Mono&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeScript = `try{if(localStorage.getItem('atalaya-theme')==='light')document.documentElement.classList.add('light')}catch(e){}`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [booted, setBooted] = useState(false);
  const done = useCallback(() => setBooted(true), []);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <FactionAtmosphere />
      <PlayerHelp />
      {!booted && <MatrixBoot onDone={done} />}
      <Toaster />
    </QueryClientProvider>
  );
}
