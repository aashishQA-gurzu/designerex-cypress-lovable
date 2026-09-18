import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ComingSoon } from "@/components/layout/AppShell";

export const Route = createFileRoute("/edits/$slug")({
  component: () => (
    <AppShell>
      <ComingSoon title="Edit" />
    </AppShell>
  ),
});
