import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { AuthModal } from "@/components/auth/AuthModal";
import { WelcomeModal } from "@/components/auth/WelcomeModal";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMySavedCheckout } from "@/lib/saved-checkout";

function NotFoundComponent() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-[10px] tracking-wider-display text-pink">404</p>
        <h1 className="mt-2 font-serif text-5xl">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn't find what you were looking for.
        </p>
        <Link to="/" className="btn-primary mt-8">Go home</Link>
      </div>
    </AppShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="font-serif text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="btn-primary"
          >
            Try again
          </button>
          <Link to="/" className="btn-outline">Go home</Link>
        </div>
      </div>
    </AppShell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Designerex — Designer dress rental, Australia" },
      { name: "description", content: "Rent designer dresses from Australia's largest peer-to-peer designer wardrobe." },
      { property: "og:title", content: "Designerex — Designer dress rental, Australia" },
      { property: "og:description", content: "Rent designer dresses from Australia's largest peer-to-peer designer wardrobe." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Designerex — Designer dress rental, Australia" },
      { name: "twitter:description", content: "Rent designer dresses from Australia's largest peer-to-peer designer wardrobe." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c44698b0-89cd-4999-997c-76f274bc376b/id-preview-0bbd55d1--a234c2c6-94d2-4512-bfe9-f738566019dc.lovable.app-1781344127462.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c44698b0-89cd-4999-997c-76f274bc376b/id-preview-0bbd55d1--a234c2c6-94d2-4512-bfe9-f738566019dc.lovable.app-1781344127462.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=GFS+Didot&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SavedCheckoutPrimer />
        <Outlet />
        <AuthModal />
        <WelcomeModal />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function SavedCheckoutPrimer() {
  const { user } = useAuth();
  useQuery({
    queryKey: ["my-saved-checkout", user?.id],
    enabled: !!user,
    queryFn: fetchMySavedCheckout,
    staleTime: 30_000,
  });
  return null;
}
