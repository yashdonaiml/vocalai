REVOKE EXECUTE ON FUNCTION public.accept_my_invitations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, public.member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, public.member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_member_emails(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_tenant_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_my_invitations(), public.create_organization(text, text), public.has_role(uuid, public.app_role), public.is_org_member(uuid, public.member_role), public.is_staff(uuid), public.is_workspace_member(uuid, public.member_role), public.org_member_emails(uuid) TO authenticated, service_role;