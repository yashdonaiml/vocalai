CREATE OR REPLACE FUNCTION public.create_organization(_org_name text, _workspace_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _org uuid;
BEGIN
  SELECT org_id INTO _existing FROM public.org_members WHERE user_id = auth.uid() LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.organizations (name, created_by) VALUES (_org_name, auth.uid()) RETURNING id INTO _org;
  INSERT INTO public.org_members (org_id, user_id, role) VALUES (_org, auth.uid(), 'owner');
  INSERT INTO public.workspaces (org_id, name) VALUES (_org, _workspace_name);
  RETURN _org;
END;
$$;