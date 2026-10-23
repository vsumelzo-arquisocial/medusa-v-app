import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/planeta/")({
  beforeLoad: () => { throw redirect({ to: "/planeta/$body", params: { body: "medusa-5" } }); },
});
