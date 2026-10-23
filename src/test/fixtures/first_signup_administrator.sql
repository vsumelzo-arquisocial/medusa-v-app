CREATE TABLE public.admin_bootstrap_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claimed boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.admin_bootstrap_state TO service_role;
ALTER TABLE public.admin_bootstrap_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.admin_bootstrap_state IS 'One-time first signup bootstrap; never exposed to clients or reset with player progress.';
INSERT INTO public.admin_bootstrap_state (id, claimed)
SELECT 1, EXISTS (SELECT 1 FROM public.profiles) OR EXISTS (SELECT 1 FROM public.user_roles);
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE first_account boolean := false;
BEGIN
  -- Row lock serializes concurrent registrations; this flag is never reopened.
  SELECT NOT claimed INTO first_account FROM public.admin_bootstrap_state WHERE id = 1 FOR UPDATE;
  first_account := COALESCE(first_account, false);
  IF first_account THEN
    first_account := NOT EXISTS (SELECT 1 FROM public.profiles) AND NOT EXISTS (SELECT 1 FROM public.user_roles);
    UPDATE public.admin_bootstrap_state SET claimed = true WHERE id = 1;
  END IF;
  INSERT INTO public.profiles (id, email, approved)
  VALUES (new.id, new.email, first_account) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user') ON CONFLICT (user_id, role) DO NOTHING;
  IF first_account THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;