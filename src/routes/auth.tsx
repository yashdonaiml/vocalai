import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import { AvirohMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeAuthRedirect as safe } from "@/lib/auth-redirect";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional(), email: z.string().email().max(200).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in: VocollAI" },
      { name: "description", content: "Sign in to build and run your AI voice agents on VocollAI." },
      { property: "og:title", content: "Sign in: VocollAI" },
      { property: "og:description", content: "Sign in to build and run your AI voice agents on VocollAI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect, email: invited } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">(invited ? "up" : "in");
  const [email, setEmail] = useState(invited ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // After Google returns here (or if already signed in), continue into the app instead of showing the form again.
  useEffect(() => {
    let done = false;
    const go = () => { if (!done) { done = true; navigate({ to: safe(redirect), replace: true }); } };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) go(); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN" && session) go(); });
    return () => data.subscription.unsubscribe();
  }, [navigate, redirect]);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + safe(redirect) },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: safe(redirect) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const callback = new URL("/auth", window.location.origin);
      callback.searchParams.set("redirect", safe(redirect));
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in did not finish. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm animate-rise rounded-lg border border-border bg-card p-8 ">
        <AvirohMark className="h-11 w-11" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Voice agents for every business.</p>
        <Button variant="outline" className="mt-6 w-full rounded-full" disabled={busy} onClick={google}>
          Continue with Google
        </Button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy} className="w-full rounded-full">
            {busy ? "Please wait" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <Button type="button" variant="ghost" className="mt-4 w-full text-center text-sm text-muted-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New to VocollAI? Create an account" : "Already have an account? Sign in"}
        </Button>
      </div>
    </div>
  );
}
