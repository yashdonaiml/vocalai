import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight, Check, FileText, BookOpen, Mic, FlaskConical, Rocket, RotateCcw,
  CalendarCheck, MessageSquare, ScrollText, AudioLines, Calendar, Users, Phone, Headphones,
  Webhook, ShoppingBag, Mail, Database,
} from "lucide-react";
import { Reveal } from "./motion";
import sceneClinic from "@/assets/landing/scene-clinic.jpg";
import sceneVan from "@/assets/landing/scene-van.jpg";
import phoneAgent from "@/assets/landing/phone-agent.jpg";
import sectionBuild from "@/assets/landing/section-build.jpg";
import sectionDeploy from "@/assets/landing/section-deploy.jpg";
import indRestaurants from "@/assets/landing/ind-restaurants.jpg";
import indClinics from "@/assets/landing/ind-clinics.jpg";
import indRealestate from "@/assets/landing/ind-realestate.jpg";
import indSalons from "@/assets/landing/ind-salons.jpg";
import indLogistics from "@/assets/landing/ind-logistics.jpg";
import indHome from "@/assets/landing/ind-homeservices.jpg";

const pillPrimary = "inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-medium text-background transition hover:opacity-90";
const pillQuiet = "inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 font-medium transition hover:bg-secondary";

/* ---------- hero ---------- */

export function Hero() {
  return (
    <section className="px-5 pb-14 pt-40 text-center md:pt-52">
      <h1 className="mx-auto max-w-5xl text-[2.6rem] leading-[1.02] md:text-[5.5rem]">
        The next caller should get more than a voicemail.
      </h1>
      <p className="mx-auto mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl">
        Build an AI voice agent around what your business actually knows. Give it your documents, choose how it speaks, test the conversation, and stay in control as things change.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link to="/demo" className={pillPrimary}>Request a demo <ArrowRight className="h-4 w-4" /></Link>
        <Link to="/auth" className={pillQuiet}>Explore the platform</Link>
      </div>
    </section>
  );
}

/* ---------- logo strip ---------- */

const capabilities = ["Your knowledge", "Your voice", "Your model choices", "Your workflows", "Your versions", "Your call history"];

export function LogoStrip({ title = "Your business stays at the center of every conversation" }: { title?: string }) {
  const row = [...capabilities, ...capabilities];
  return (
    <section className="py-14">
      <p className="text-center text-sm text-muted-foreground">{title}</p>
      <div className="relative mt-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />
        <div className="flex w-max animate-marquee items-center gap-16">
          {row.map((n, i) => (
            <span key={`${n}-${i}`} className="whitespace-nowrap text-2xl font-bold tracking-tight text-muted-foreground/45">{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- platform showcase ---------- */

const tabs = [
  {
    key: "build", label: "1. Build", image: sceneClinic, bubble: "How can I help?",
    heading: "Give every answer a place to start",
    actions: [
      { icon: FileText, text: "Upload your policies and FAQs" },
      { icon: BookOpen, text: "Search your business knowledge" },
      { icon: Mic, text: "Choose a voice and model" },
    ],
  },
  {
    key: "deploy", label: "2. Deploy", image: sectionDeploy, bubble: "Can you check my service request?",
    heading: "Keep changes deliberate",
    actions: [
      { icon: FlaskConical, text: "Write scenarios to test" },
      { icon: Rocket, text: "Publish a versioned agent" },
      { icon: RotateCcw, text: "Return to an earlier version" },
    ],
  },
  {
    key: "operate", label: "3. Operate", image: sceneVan, bubble: "What happened on that call?",
    heading: "Know what your agent said",
    actions: [
      { icon: CalendarCheck, text: "Connect your own tools" },
      { icon: MessageSquare, text: "Review conversation history" },
      { icon: ScrollText, text: "Track usage by workspace" },
    ],
  },
];
const TAB_MS = 6000;

export function Showcase() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setActive((a) => (a + 1) % tabs.length), TAB_MS);
    return () => clearTimeout(id);
  }, [active]);
  const tab = tabs[active]!;
  return (
    <section id="platform" className="mx-auto max-w-6xl px-3 md:px-5">
      <Reveal>
        <div className="rounded-[2rem] border border-border bg-card p-2 shadow-card">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <h2 className="text-2xl md:text-3xl">One place to shape every conversation</h2>
            <div role="tablist" className="flex gap-1 rounded-full bg-secondary p-1">
              {tabs.map((t, i) => (
                <button
                  key={t.key} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
                  className={`relative overflow-hidden rounded-full px-4 py-2 text-sm transition ${i === active ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                  {i === active && <span key={active} className="tab-progress absolute bottom-0 left-0 h-0.5 bg-primary" style={{ animationDuration: `${TAB_MS}ms` }} />}
                </button>
              ))}
            </div>
          </div>
          <div className="grain relative aspect-[16/11] overflow-hidden rounded-[1.6rem] md:aspect-[16/9]">
            {tabs.map((t, i) => (
              <img key={t.key} src={t.image} alt="" width={1600} height={1008}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === active ? "opacity-100" : "opacity-0"}`} />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
            <div key={`${tab.key}-b`} className="absolute right-6 top-6 hidden animate-rise items-center gap-3 md:flex">
              <span className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_35%_35%,#A7D7C6,#245C4F)]" />
              <span className="rounded-full bg-white/80 px-5 py-2.5 text-[15px] text-[#202521] backdrop-blur">{tab.bubble}</span>
            </div>
            <div key={tab.key} className="absolute bottom-4 left-4 w-[min(90%,420px)] animate-rise md:bottom-10 md:left-10">
              <div className="rounded-3xl border border-white/10 bg-[#191D1B]/95 p-3 text-white">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary"><AudioLines className="h-3.5 w-3.5" /></span>
                  <p className="text-sm md:text-base">{tab.heading}</p>
                </div>
                <div className="space-y-1.5">
                  {tab.actions.map((a) => (
                    <div key={a.text} className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-3 py-2.5 text-sm">
                      <a.icon className="h-4 w-4 text-[#A7D7C6]" /> {a.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------- numbered feature sections ---------- */

const numbered = [
  {
    id: "build", n: "01", title: "Build an agent that knows your business", image: phoneAgent,
    body: "A caller asks a specific question. Your agent should have a better starting point than a generic prompt. Bring the documents your team already relies on into a searchable knowledge base.",
    bullets: ["Add PDFs, documents or pasted text", "Search and check what your agent can retrieve", "Choose from available voice and model providers"],
    callout: "Built from your knowledge", detail: "Your sources shape the answer.",
  },
  {
    id: "deploy", n: "02", title: "Ship voice like you ship software", image: sectionDeploy,
    body: "The best answer today may be wrong after your policies change. Keep an editable draft, publish a fixed version, and choose what goes into each environment.",
    bullets: ["Keep draft changes separate from published versions", "Define test scenarios and review results", "Switch a deployment back to an earlier version"],
    callout: "Change with confidence", detail: "Know which version is in use.",
  },
  {
    id: "operate", n: "03", title: "See every call, measure every minute", image: sectionBuild,
    body: "A voice agent is only useful if you can see how it behaves. Review conversations and usage, then use what you learn to improve the next version.",
    bullets: ["Inspect saved conversations and transcripts", "See usage across your workspace", "Adjust your agent without losing its history"],
    callout: "Every call has context", detail: "See more than a call count.",
  },
];

export function Numbered() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      {numbered.map((s, i) => (
        <section key={s.id} id={s.id} className="grid items-center gap-12 py-20 md:grid-cols-2 md:py-28">
          <Reveal className={i % 2 ? "md:order-2" : ""}>
            <p className="font-mono text-sm text-primary">{s.n}</p>
            <h2 className="mt-3 text-4xl leading-[1.05] md:text-[3.4rem]">{s.title}</h2>
            <p className="mt-5 text-lg text-muted-foreground">{s.body}</p>
            <ul className="mt-7 space-y-3">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>{b}</li>
              ))}
            </ul>
            <div className="mt-9 border-t border-border pt-6">
              <p className="text-2xl font-semibold md:text-3xl">{s.callout}</p>
              <p className="mt-1 text-muted-foreground">{s.detail}</p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="grain overflow-hidden rounded-[2rem] border border-border bg-secondary p-3 shadow-card">
              <img src={s.image} alt="" width={1200} height={912} loading="lazy" className="block w-full rounded-[1.5rem]" />
            </div>
          </Reveal>
        </section>
      ))}
    </div>
  );
}

/* ---------- industries ---------- */

export const industryList = [
  { name: "Healthcare administration", img: indClinics, use: "General information, appointment coordination, and approved patient guidance." },
  { name: "Financial services", img: indRealestate, use: "Account routing, application intake, and policy-based answers." },
  { name: "Property services", img: indHome, use: "Service intake, tenant questions, and maintenance coordination." },
  { name: "Logistics", img: indLogistics, use: "Delivery status, dispatch intake, and exception routing." },
  { name: "Hospitality", img: indRestaurants, use: "Guest questions, availability, and service requests." },
  { name: "Professional services", img: indSalons, use: "Lead qualification, scheduling, and client intake." },
];

export function Industries() {
  return (
    <section id="industries" className="border-y border-border bg-secondary/50">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p id="use-cases" className="text-sm font-medium text-primary">BUILT FOR MANY INDUSTRIES</p>
          <h2 className="mt-4 max-w-3xl text-4xl leading-[1.05] md:text-[3.4rem]">One platform for every kind of team.</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {industryList.map((it, i) => (
            <Reveal key={it.name} delay={i * 60}>
              <div className="group relative aspect-[4/5] overflow-hidden rounded-[1.75rem] transition duration-300 hover:-translate-y-1">
                <img src={it.img} alt={it.name} width={800} height={1008} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <h3 className="text-2xl font-semibold tracking-tight">{it.name}</h3>
                  <p className="mt-1 text-sm text-white/80">{it.use}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- practical product story ---------- */

export function Testimonials() {
  return (
    <section id="customers" className="mx-auto max-w-6xl px-5 py-24">
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:items-center">
        <Reveal>
          <p className="text-sm font-medium text-primary">THE QUESTION BEHIND THE CALL</p>
          <h2 className="mt-4 text-4xl leading-[1.05] md:text-[3.4rem]">What would your team want the agent to know?</h2>
          <p className="mt-6 text-lg text-muted-foreground">Your hours change. A policy gets updated. A customer asks about an exception. Give your agent the same source material your team checks, and review the conversation when it matters.</p>
          <Link to="/demo" className="mt-8 inline-flex items-center gap-2 font-medium text-primary hover:underline">Talk through your use case <ArrowRight className="h-4 w-4" /></Link>
        </Reveal>
        <Reveal delay={120}>
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-card">
            <img src={sceneClinic} alt="Clinic reception desk" width={1600} height={1008} loading="lazy" className="aspect-[16/10] w-full object-cover" />
            <div className="p-6 md:p-8">
              <p className="text-xs font-medium uppercase text-muted-foreground">Example conversation</p>
              <p className="mt-3 text-lg">“Can I change my appointment if I need to?”</p>
              <p className="mt-3 text-sm text-muted-foreground">A useful answer starts with the right policy, not a guess.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- integrations ---------- */

const tools = [
  { icon: Calendar, name: "Calendar endpoint" }, { icon: Users, name: "CRM endpoint" }, { icon: Phone, name: "SIP phone routing" },
  { icon: Headphones, name: "Support endpoint" }, { icon: Webhook, name: "Custom webhook" }, { icon: ShoppingBag, name: "Order endpoint" },
  { icon: Mail, name: "Messaging endpoint" }, { icon: Database, name: "Data endpoint" },
];

export function Integrations() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <Reveal className="text-center">
        <h2 className="text-4xl leading-[1.05] md:text-[3.4rem]">Let your agent take action</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">Connect your systems and choose what your agent can do during a call, like booking or looking up an order.</p>
      </Reveal>
      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tools.map((t, i) => (
          <Reveal key={t.name} delay={i * 40}>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-muted-foreground"><t.icon className="h-5 w-5" /></span>
              <span className="font-medium">{t.name}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------- final CTA ---------- */

export function CtaBand() {
  return (
    <>
      <LogoStrip title="Make it sound like your business, not a generic bot" />
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-primary px-6 py-24 text-center text-primary-foreground">
            <h2 className="mx-auto max-w-3xl text-4xl leading-[1.05] md:text-6xl">Make the next call count</h2>
            <p className="mx-auto mt-5 max-w-md text-lg opacity-80">Start with what your team knows. Build an agent you can test and improve.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link to="/demo" className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-medium text-background hover:opacity-90">Request a demo <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-background px-6 py-3.5 font-medium text-foreground hover:opacity-90">Start building</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
