import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ComingSoon } from "@/components/layout/AppShell";

export const Route = createFileRoute("/cities/$slug")({
  component: () => (
    <AppShell>
      <ComingSoon title="City" />
    </AppShell>
  ),
});
