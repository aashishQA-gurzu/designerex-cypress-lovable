import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Instagram, Mail, Phone, Clock } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Designerex" },
      {
        name: "description",
        content:
          "Get in touch with the Designerex team. We're here to help with questions about renting, lending, and more.",
      },
      { property: "og:title", content: "Contact Us — Designerex" },
      {
        property: "og:description",
        content:
          "Get in touch with the Designerex team.",
      },
    ],
  }),
  component: ContactPage,
});

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.74a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.17z" />
    </svg>
  );
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const [attempted, setAttempted] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fieldErrors: Record<string, string> = {};
  if (name.trim().length === 0) fieldErrors['name'] = "Please enter your name.";
  if (!emailRegex.test(email.trim())) fieldErrors['email'] = "Please enter a valid email address.";
  if (message.trim().length === 0) fieldErrors['message'] = "Please enter a message.";
  const showError = (k: string) => (attempted ? fieldErrors[k] : undefined);

  const isComplete = Object.keys(fieldErrors).length === 0;
  const canSubmit = isComplete && status !== "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!canSubmit) return;

    setStatus("submitting");

    const { error } = await supabase
      .from("contact_messages")
      .insert({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim() || null,
        message: message.trim(),
      });

    if (error) {
      setStatus("error");
      return;
    }

    setStatus("success");
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
  }

  return (
    <AppShell>
      {/* Intro */}
      <section className="bg-cream pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <p className="text-[10px] tracking-wider-display text-pink">CONTACT US</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
            Get in touch
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            We'd love to hear from you. Send us a message and our team will get back to you, or reach us directly using the details below.
          </p>
        </div>
      </section>

      {/* Two columns */}
      <section className="bg-background py-10 md:py-16">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-6 md:grid-cols-2 md:gap-16">
          {/* Left — contact details */}
          <div className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl">Contact details</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Reach us directly — we're here to help.
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-soft text-pink">
                  <Mail className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <a
                    href="mailto:hello@designerex.com.au"
                    className="text-sm text-muted-foreground transition-colors hover:text-pink"
                  >
                    hello@designerex.com.au
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-soft text-pink">
                  <Phone className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <a
                    href="tel:1300123456"
                    className="text-sm text-muted-foreground transition-colors hover:text-pink"
                  >
                    1300 123 456
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-soft text-pink">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Hours</p>
                  <p className="text-sm text-muted-foreground">
                    Monday to Friday, 9am–5pm AEST
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Follow us</p>
              <div className="mt-3 flex gap-3">
                <a
                  href="https://www.instagram.com/_designerex/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-pink hover:text-pink"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href="https://www.tiktok.com/@_designerexoffici"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-pink hover:text-pink"
                >
                  <TikTokIcon className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div>
            {status === "success" ? (
              <div className="rounded-xl border border-border bg-white p-6 shadow-sm md:p-8">
                <p className="text-lg font-medium text-foreground">
                  Thanks — we've got your message and we'll be in touch soon.
                </p>
                <button
                  onClick={() => setStatus("idle")}
                  className="btn-outline mt-6"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                    Name <span className="text-pink">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    placeholder="Your name"
                  />
                  {showError("name") && <p className="mt-1 text-xs text-destructive">{fieldErrors['name']}</p>}
                </div>

                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                    Email <span className="text-pink">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                  />
                  {showError("email") && <p className="mt-1 text-xs text-destructive">{fieldErrors['email']}</p>}
                </div>

                <div>
                  <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
                    Subject
                  </label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="input"
                    placeholder="What's this about?"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
                    Message <span className="text-pink">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input min-h-[120px] resize-y"
                    placeholder="How can we help?"
                  />
                  {showError("message") && <p className="mt-1 text-xs text-destructive">{fieldErrors['message']}</p>}
                </div>

                {status === "error" && (
                  <p className="text-sm text-destructive">
                    Something went wrong sending your message. Please email us at{" "}
                    <a href="mailto:hello@designerex.com.au" className="underline">
                      hello@designerex.com.au
                    </a>{" "}
                    and we'll help right away.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  aria-disabled={!canSubmit}
                  className={`btn-primary w-full sm:w-auto ${!canSubmit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {status === "submitting" ? "Sending…" : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
