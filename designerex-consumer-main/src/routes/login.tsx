import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const Route = createFileRoute("/login")({
  component: () => (
    <AppShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <p className="text-center text-[10px] tracking-wider-display text-pink">DESIGNEREX</p>
        <h1 className="mt-1 text-center font-display text-4xl">Welcome back</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sign in to access your wardrobe.
        </p>
        <div className="mt-8 rounded-xl bg-card p-8 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link to="/signup" className="font-medium text-pink hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AppShell>
  ),
});
