DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dashboard_default_view text';
    BEGIN
      EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_dashboard_default_view_chk CHECK (dashboard_default_view IN (''lending'',''renting''))';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;