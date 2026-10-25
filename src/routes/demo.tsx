import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CheckCircle2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import phone from "@/assets/landing/phone-agent.jpg";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Request a demo | aviroh" },
      { name: "description", content: "Tell us what your business needs from an AI voice agent and request a walkthrough of aviroh." },
      { property: "og:title", content: "Request a demo | aviroh" },
      { property: "og:description", content: "See how aviroh can use your knowledge to shape the conversations you want to handle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Demo,
});

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email").max(255),
  company: z.string().trim().max(160).optional(),
  team_size: z.string().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});

function Demo() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please check the form"); return; }
    setError(null); setState("sending");
    const d = parsed.data;
    const { error: err } = await supabase.from("demo_requests").insert({
      name: d.name, email: d.email,
      company: d.company || null, team_size: d.team_size || null, message: d.message || null,
    });
    if (err) { setError("Something went wrong. Please try again."); setState("idle"); return; }
    setState("done");
  }

  const input = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteNav />
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-40 md:grid-cols-2 md:pt-48">
        <div>
          <h1 className="text-4xl leading-[1.05] md:text-6xl">Show us the calls you wish you could answer better</h1>
          <p className="mt-5 text-lg text-muted-foreground">A good voice agent starts with a real question. Tell us what callers ask, what your team looks up, and where the conversation needs to go next.</p>
          <p className="mt-8 font-semibold">What to expect</p>
          <ul className="mt-4 space-y-3 text-muted-foreground">
            {["See how business documents become searchable knowledge.", "Walk through agent setup, versioned publishing and call review.", "Discuss model choices and the connections your workflow needs."].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>{t}</li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-4 rounded-3xl border border-border bg-card p-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">A</span>
            <div><p className="font-semibold">A conversation about your use case</p><p className="text-sm text-muted-foreground">Share the questions your callers actually ask</p></div>
          </div>
          <img src={phone} alt="aviroh voice agent on a phone" width={1200} height={912} loading="lazy" className="mt-10 hidden rounded-3xl border border-border md:block" />
        </div>

        <div className="h-fit rounded-3xl border border-border bg-card p-8 shadow-card">
          {state === "done" ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <h2 className="mt-4 text-2xl">Thanks for telling us about your business</h2>
              <p className="mt-2 text-muted-foreground">We got your request and will be in touch soon.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-2xl">Tell us about your business</h2>
              <input name="name" placeholder="Full name" className={input} required />
              <input name="email" type="email" placeholder="Work email" className={input} required />
              <input name="company" placeholder="Company" className={input} />
              <select name="team_size" className={input} defaultValue="">
                <option value="" disabled>Calls per month</option>
                <option>Under 500</option><option>500 to 5,000</option><option>5,000 to 50,000</option><option>50,000+</option>
              </select>
              <textarea name="message" rows={4} placeholder="What should your voice agent handle?" className={input} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button disabled={state === "sending"} className="w-full rounded-full bg-foreground px-5 py-3 font-medium text-background hover:opacity-90 disabled:opacity-60">
                {state === "sending" ? "Sending" : "Request demo"}
              </Button>
            </form>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
