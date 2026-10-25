import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Drafts an agent through the tenant-aware provider registry.
export const draftAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ workspaceId: z.string().uuid(), description: z.string().trim().min(10).max(2000), language: z.string().max(40).default("English") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("is_workspace_member", { _ws: data.workspaceId });
    if (accessError || !allowed) throw new Error("Workspace access is required to draft an agent.");
    const prompt = `Draft a phone voice agent for this business. Use the description and language supplied in the input data.
Return only JSON with keys: name (max 60 chars), description (one sentence), persona (one sentence), instructions (clear rules, max 1500 chars), greeting (one sentence the agent says first), guardrails (one or two sentences), handoff (one sentence), steps (array of 3 to 6 objects {title, say} describing the call in order; the last one wraps up).
Never invent prices, hours, addresses or policies; tell the agent to use its knowledge for facts.`;
    const { generateWorkspaceJson } = await import("./providers/registry.server");
    const raw = await generateWorkspaceJson(data.workspaceId, prompt, { description: data.description, language: data.language }) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s*[—–]\s*/g, ", ").replace(/…/g, ".").trim().slice(0, max) : "");
    const steps = (Array.isArray(raw["steps"]) ? raw["steps"] : []).slice(0, 6).map((s) => ({ title: str((s as { title?: unknown })?.title, 60) || "Step", say: str((s as { say?: unknown })?.say, 600) }));
    return {
      name: str(raw["name"], 60) || "New agent",
      description: str(raw["description"], 300),
      persona: str(raw["persona"], 300),
      instructions: str(raw["instructions"], 12000),
      greeting: str(raw["greeting"], 400),
      guardrails: str(raw["guardrails"], 600),
      handoff: str(raw["handoff"], 400),
      steps,
    };
  });
