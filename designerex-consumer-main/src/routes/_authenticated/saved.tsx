import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated/saved")({
  component: () => <ComingSoon title="Saved items" />,
});
