import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ComingSoon } from "@/components/layout/AppShell";

export const Route = createFileRoute("/designers/$slug")({
  component: () => (
    <AppShell>
      <ComingSoon title="Designer" />
    </AppShell>
  ),
});
