import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { LogoStrip } from "@/components/landing/sections";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing | aviroh" },
      { name: "description", content: "Explore what is available in aviroh and tell us what you need from an AI voice agent platform." },
      { property: "og:title", content: "Pricing | aviroh" },
      { property: "og:description", content: "Find the right starting point for your voice agent project. Pricing is available on request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pricing,
});

const plans = [
  {
    name: "Build", tag: "Shape your first agent", featured: false,
    features: ["Create an agent in your workspace", "Add business documents and test retrieval", "Choose from supported models and voices", "Inspect conversations and usage"],
  },
  {
    name: "Deploy", tag: "Bring a working agent into your operation", featured: true,
    features: ["Publish fixed agent versions", "Deploy to development or production", "Connect phone numbers to your agents", "Switch back to an earlier version"],
  },
  {
    name: "Extend", tag: "Fit your stack", featured: false,
    features: ["Bring your own provider keys", "Register webhook tools", "Organize workspaces and team access", "Review usage across providers"],
  },
];

function Pricing() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteNav />
      <section className="px-5 pb-12 pt-40 text-center md:pt-48">
        <p className="mb-4 text-sm font-medium text-primary">PRICING</p>
        <h1 className="mx-auto max-w-4xl animate-rise text-4xl leading-[1.05] md:text-7xl">Start with the calls that matter to you</h1>
        <p className="mx-auto mt-6 max-w-2xl animate-rise text-lg text-muted-foreground">
          Your calls, provider choices and workflows are unique. Tell us what you want your agent to handle, and we will discuss a setup and quote that fit. Public rates are not available yet.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-24 md:grid-cols-3 md:items-center">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-3xl border border-border bg-card p-8 ${p.featured ? "z-10 shadow-lift md:-my-6 md:py-12" : "shadow-card md:opacity-80 md:scale-[0.96]"}`}
          >
            {p.featured && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-primary">
                Explore this path
              </span>
            )}
            <p className="text-sm text-muted-foreground">{p.tag}</p>
            <h2 className="mt-1 text-3xl">{p.name}</h2>
            <div className="my-6 h-px bg-border" />
            <p className="text-sm font-semibold">What you can explore</p>
            <ul className="mt-4 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to={p.name === "Build" ? "/auth" : "/demo"}
              className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-medium ${p.featured ? "bg-foreground text-background hover:opacity-90" : "border border-border hover:bg-secondary"}`}
            >
              {p.name === "Build" ? "Explore aviroh" : "Discuss your setup"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </section>
      <LogoStrip title="Built around your knowledge, providers and workflows" />
      <SiteFooter />
    </div>
  );
}
