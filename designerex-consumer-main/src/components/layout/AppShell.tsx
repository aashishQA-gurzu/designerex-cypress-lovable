import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailPrompt";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background">
      <Header />
      <VerifyEmailBanner />
      <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden">{children}</main>
      <Footer />
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 inline-block rounded-full bg-pink-soft px-3 py-1 text-[10px] tracking-wider-display text-pink">
        COMING SOON
      </span>
      <h1 className="font-serif text-4xl md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        We're polishing this page. Check back soon — or browse the rest of Designerex in the meantime.
      </p>
    </div>
  );
}
