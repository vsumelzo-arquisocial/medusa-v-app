import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignDashboard, type DashboardData } from "@/components/dashboard/CampaignDashboard";

const dashboardQuery = queryOptions({
  queryKey: ["public-dashboard"],
  refetchInterval: 15_000,
  refetchIntervalInBackground: true,
  retry: true,
  queryFn: async () => {
    // Avanza viajes y asaltos vencidos (también disponible sin sesión)
    await supabase.rpc("campaign_tick").then(
      () => undefined,
      () => undefined,
    );
    const { data, error } = await supabase.rpc("public_dashboard" as never);
    if (error) throw error;
    return data as unknown as DashboardData;
  },
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard de campaña · Atalaya" },
      {
        name: "description",
        content: "Sistema Medusa en directo: planetas, naves, conquista y batallas en curso.",
      },
      { property: "og:title", content: "Dashboard de campaña · Atalaya" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isError } = useQuery(dashboardQuery);
  return <CampaignDashboard data={data} error={isError} />;
}
