import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const Route = createFileRoute("/signup")({
  component: () => (
    <AppShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <p className="text-center text-[10px] tracking-wider-display text-pink">DESIGNEREX</p>
        <h1 className="mt-1 text-center font-display text-4xl">Join Designerex</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Get 10% off your first booking.
        </p>
        <div className="mt-8 rounded-xl bg-card p-8 shadow-sm">
          <SignupForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already a member?{" "}
          <Link to="/login" className="font-medium text-pink hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AppShell>
  ),
});
