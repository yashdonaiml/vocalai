DROP POLICY IF EXISTS "Anyone can submit a demo request" ON public.demo_requests;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='demo_requests' AND cmd='INSERT' LOOP EXECUTE format('DROP POLICY %I ON public.demo_requests', p.policyname); END LOOP; END $$;
CREATE POLICY "Visitors can submit a valid demo request" ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (length(trim(name)) BETWEEN 1 AND 120 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 200
  AND coalesce(length(company),0) <= 200 AND coalesce(length(team_size),0) <= 40 AND coalesce(length(message),0) <= 2000);
DELETE FROM public.demo_requests WHERE name = 'Test QA';