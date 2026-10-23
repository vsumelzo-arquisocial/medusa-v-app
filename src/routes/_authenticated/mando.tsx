import { createFileRoute } from "@tanstack/react-router";
import { CommandShell } from "@/components/CommandShell";
import { NavalCommand, raidsQuery } from "@/components/ship/NavalCombat";
import { profileQuery } from "@/lib/profile";
import { campaignQuery } from "@/lib/campaign-queries";
import { ShipTravel } from "@/components/ship/ShipTravel";
import { useSuspenseQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/mando")({
  head: () => ({
    meta: [
      { title: "Mando de la Nave Capital — Atalaya" },
      { name: "description", content: "Gobierna tu nave capital: postura defensiva, ofensivas navales y archivo de combates contra otros capitanes." },
      { property: "og:title", content: "Mando de la Nave Capital — Atalaya" },
      { property: "og:description", content: "Lanza ofensivas nave contra nave en la órbita de Medusa V." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(raidsQuery), context.queryClient.ensureQueryData(campaignQuery)]),
  component: Mando,
});

function Mando() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  return (
    <CommandShell>
      <h1 className="mb-4 font-display text-2xl text-primary glow">Mando de la Nave Capital</h1>
      <ShipTravel uid={prof.user.id} />
      <NavalCommand />
    </CommandShell>
  );
}
