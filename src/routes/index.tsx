import { createFileRoute } from "@tanstack/react-router";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Hero, LogoStrip, Showcase, Numbered, Industries, Testimonials, Integrations, CtaBand } from "@/components/landing/sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "aviroh | Programmable voice AI for every business" },
      { name: "description", content: "Build, test, deploy, and operate voice agents with your knowledge, tools, providers, and governance." },
      { property: "og:title", content: "aviroh | Programmable voice AI for every business" },
      { property: "og:description", content: "A programmable platform for building and operating voice agents across teams and industries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteNav />
      <Hero />
      <Showcase />
      <LogoStrip />
      <Numbered />
      <Industries />
      <Testimonials />
      <Integrations />
      <CtaBand />
      <SiteFooter />
    </div>
  );
}
