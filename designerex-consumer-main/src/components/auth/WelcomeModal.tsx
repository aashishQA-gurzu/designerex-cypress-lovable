import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function WelcomeModal() {
  const { welcomeDiscountCode, hideWelcome } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!welcomeDiscountCode) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(welcomeDiscountCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={hideWelcome}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-background shadow-2xl"
      >
        <div className="bg-pink-soft px-10 py-12 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink text-pink-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="font-display text-4xl">Welcome to Designerex! 🎉</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Here's <span className="font-medium text-ink">10% off</span> your first booking.
          </p>
        </div>

        <div className="px-10 py-8">
          <p className="mb-3 text-center text-[10px] tracking-wider-display text-muted-foreground">
            YOUR DISCOUNT CODE
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 select-all rounded-lg border-2 border-dashed border-pink bg-pink-soft px-4 py-4 text-center font-mono text-xl font-medium tracking-wider text-ink">
              {welcomeDiscountCode}
            </code>
            <button
              onClick={copy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-medium text-ink-foreground transition-opacity hover:opacity-90"
              aria-label="Copy code"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Valid for 72 hours — apply at checkout.
          </p>

          <button onClick={hideWelcome} className="btn-primary mt-6 w-full">
            Start browsing
          </button>
        </div>
      </div>
    </div>
  );
}
