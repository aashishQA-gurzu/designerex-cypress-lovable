import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

export function AuthModal() {
  const { authModal, closeAuthModal, openAuthModal } = useAuth();
  if (!authModal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={closeAuthModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-xl bg-background shadow-2xl"
      >
        <button
          onClick={closeAuthModal}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-ink/60 transition-colors hover:bg-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-8 pt-10 pb-8">
          <p className="text-center text-[10px] tracking-wider-display text-pink">DESIGNEREX</p>
          <h2 className="mt-1 text-center font-display text-3xl">
            {authModal === "login" ? "Welcome back" : "Join Designerex"}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {authModal === "login"
              ? "Sign in to access your wardrobe."
              : "Get 10% off your first booking."}
          </p>

          <div className="mt-6">
            {authModal === "login" ? <LoginForm /> : <SignupForm />}
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {authModal === "login" ? (
              <>
                New here?{" "}
                <button onClick={() => openAuthModal("signup")} className="font-medium text-pink hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already a member?{" "}
                <button onClick={() => openAuthModal("login")} className="font-medium text-pink hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
