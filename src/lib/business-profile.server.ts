import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessProfileReadiness,
  compileBusinessProfile,
  parseBusinessProfile,
  type BusinessProfileV1,
} from "./business-profile";
import { setupSnapshot } from "./setup-preview-authority.server";

async function database() {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}

async function authorize(workspaceId: string, actorId: string) {
  const db = await database();
  const { data, error } = await db.rpc("release_actor_is_admin", {
    _workspace: workspaceId,
    _actor: actorId,
  });
  if (error || !data) throw new Error("Workspace admin access is required to edit this assistant.");
  return db;
}

export async function getBusinessProfileSetup(
  workspaceId: string,
  setupId: string,
  actorId: string,
) {
  const db = await authorize(workspaceId, actorId);
  const { data: setup, error } = await db
    .from("agent_setup_runs")
    .select("id,agent_id,revision,business_profile")
    .eq("id", setupId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !setup) throw new Error("Assistant setup not found in this workspace.");
  const profile = setup.business_profile ? parseBusinessProfile(setup.business_profile) : null;
  return {
    setupId: setup.id,
    agentId: setup.agent_id,
    revision: setup.revision,
    profile,
    readiness: businessProfileReadiness(profile),
  };
}

export async function saveBusinessProfileSetup(input: {
  workspaceId: string;
  setupId: string;
  actorId: string;
  expectedRevision: number;
  profile: BusinessProfileV1;
}) {
  const profile = parseBusinessProfile(input.profile);
  const db = await authorize(input.workspaceId, input.actorId);
  const { data: setup, error: setupError } = await db
    .from("agent_setup_runs")
    .select("agent_id")
    .eq("id", input.setupId)
    .eq("workspace_id", input.workspaceId)
    .single();
  if (setupError || !setup) throw new Error("Assistant setup not found in this workspace.");
  const { data: agent, error: agentError } = await db
    .from("agents")
    .select("config")
    .eq("id", setup.agent_id)
    .eq("workspace_id", input.workspaceId)
    .single();
  if (agentError || !agent) throw new Error("Assistant draft not found in this workspace.");

  const config = compileBusinessProfile(profile, agent.config);
  const { data, error } = await db.rpc("save_business_profile_setup", {
    _ws: input.workspaceId,
    _setup: input.setupId,
    _actor: input.actorId,
    _revision: input.expectedRevision,
    _profile: profile,
    _config: config,
    _hash: await setupSnapshot(config),
  });
  if (error || !data) throw new Error(error?.message ?? "Could not save the business profile.");
  return {
    setupId: data.id as string,
    agentId: data.agent_id as string,
    revision: data.revision as number,
    profile,
    config,
    readiness: businessProfileReadiness(profile),
  };
}
