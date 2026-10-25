CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger text NOT NULL DEFAULT 'call.ended' CHECK (trigger IN ('call.started','call.ended','tool.result','keyword')),
  trigger_value text,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read workflows" ON public.workflows FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "admins write workflows" ON public.workflows FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id,'admin')) WITH CHECK (public.is_workspace_member(workspace_id,'admin'));
CREATE TRIGGER audit_workflows AFTER INSERT OR UPDATE OR DELETE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.log_tenant_change();

CREATE TABLE public.security_policies (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_calls boolean NOT NULL DEFAULT false,
  announce_recording boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
  transcript_access text NOT NULL DEFAULT 'member' CHECK (transcript_access IN ('member','admin')),
  redact_pii boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_policies TO authenticated;
GRANT ALL ON public.security_policies TO service_role;
ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read policy" ON public.security_policies FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "admins insert policy" ON public.security_policies FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id,'admin'));
CREATE POLICY "admins update policy" ON public.security_policies FOR UPDATE TO authenticated USING (public.is_org_member(org_id,'admin')) WITH CHECK (public.is_org_member(org_id,'admin'));

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret_hint text NOT NULL,
  secret_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read webhooks" ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id,'admin'));

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event text NOT NULL,
  status integer,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id,'admin'));