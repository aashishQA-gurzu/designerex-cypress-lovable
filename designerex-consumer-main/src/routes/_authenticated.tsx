import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { user, loading, openAuthModal } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      openAuthModal("login", window.location.pathname);
    }
  }, [loading, user, openAuthModal]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="font-serif text-3xl">Sign in required</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Please sign in to access this page.
          </p>
          <button onClick={() => openAuthModal("login", window.location.pathname)} className="btn-primary mt-6">
            Sign in
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
