import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AvirohLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const menus: Record<string, { label: string; href: string; note: string }[]> = {
  Solutions: [
    { label: "Customer support", href: "/#use-cases", note: "Resolve routine questions with approved knowledge" },
    { label: "Lead qualification", href: "/#use-cases", note: "Capture intent and route qualified demand" },
    { label: "Service coordination", href: "/#use-cases", note: "Handle scheduling, status, and dispatch requests" },
    { label: "Internal help desk", href: "/#use-cases", note: "Give teams a voice interface to trusted information" },
  ],
  Company: [
    { label: "Why aviroh", href: "/#customers", note: "Built around your business knowledge" },
    { label: "Pricing", href: "/pricing", note: "Discuss a setup that fits" },
    { label: "Request demo", href: "/demo", note: "Talk through your use case" },
  ],
};

function Dropdown({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-auto gap-1 p-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground">
        {name} <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="absolute left-1/2 top-full w-72 -translate-x-1/2 pt-4">
          <div className="animate-rise rounded-3xl border border-border bg-card p-2 shadow-lift">
            {menus[name]!.map((m) => (
              <a key={m.label} href={m.href} className="block rounded-2xl px-4 py-3 hover:bg-secondary">
                <p className="font-medium text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.note}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Floating island nav shared by the public marketing pages. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="fixed inset-x-0 top-3 z-30 px-3">
      <header className={`mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border border-border bg-card/95 pl-6 pr-2 transition-shadow ${scrolled ? "shadow-lift" : ""}`}>
        <Link to="/" aria-label="aviroh home"><AvirohLogo /></Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="/#platform" className="hover:text-foreground">Platform</a>
          <Dropdown name="Solutions" />
          <a href="/#customers" className="hover:text-foreground">Why aviroh</a>
          <Link to="/pricing" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Pricing</Link>
          <Dropdown name="Company" />
        </nav>
        <div className="flex items-center gap-1">
          <Link to="/auth" className="hidden px-4 text-sm text-muted-foreground hover:text-foreground sm:inline">Login</Link>
          <Link to="/demo" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90">Request demo</Link>
        </div>
      </header>
      <div className={`mx-auto mt-2 hidden max-w-6xl justify-end transition-opacity md:flex ${scrolled ? "pointer-events-none opacity-0" : ""}`}>
        <Link to="/demo" className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground hover:text-foreground">Have a use case in mind? Let's talk</Link>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 text-sm text-muted-foreground md:grid-cols-5">
        <div className="md:col-span-1">
          <AvirohLogo />
          <p className="mt-3 max-w-[16rem]">Voice agents that know your business.</p>
        </div>
        <div><p className="font-medium text-foreground">Platform</p><ul className="mt-3 space-y-2"><li><a href="/#build">Build</a></li><li><a href="/#deploy">Deploy</a></li><li><a href="/#operate">Operate</a></li></ul></div>
        <div><p className="font-medium text-foreground">Solutions</p><ul className="mt-3 space-y-2"><li><a href="/#use-cases">Customer support</a></li><li><a href="/#use-cases">Lead qualification</a></li><li><a href="/#industries">Industries</a></li></ul></div>
        <div><p className="font-medium text-foreground">Company</p><ul className="mt-3 space-y-2"><li><Link to="/pricing">Pricing</Link></li><li><Link to="/demo">Request demo</Link></li><li><Link to="/auth">Login</Link></li></ul></div>
        <div><p className="font-medium text-foreground">Legal</p><ul className="mt-3 space-y-2"><li>Privacy</li><li>Terms</li><li>© 2026 aviroh</li></ul></div>
      </div>
      <p aria-hidden className="select-none text-center text-[22vw] font-bold leading-[0.75] tracking-tighter text-foreground/[0.04]">aviroh</p>
    </footer>
  );
}
