CREATE TABLE public.conversation_tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 tag text NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (conversation_id, tag)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_tags TO authenticated;
GRANT ALL ON public.conversation_tags TO service_role;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read conversation tags" ON public.conversation_tags FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "workspace admins add conversation tags" ON public.conversation_tags FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, 'admin') AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.workspace_id = workspace_id));
CREATE POLICY "workspace admins remove conversation tags" ON public.conversation_tags FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, 'admin'));
CREATE OR REPLACE FUNCTION public.touch_conversation_tag() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_conversation_tag BEFORE UPDATE ON public.conversation_tags FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_tag();