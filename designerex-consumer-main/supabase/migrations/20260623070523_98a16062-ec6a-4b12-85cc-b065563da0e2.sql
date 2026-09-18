CREATE TABLE public.availability_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dress_id uuid NOT NULL,
  desired_start date NOT NULL,
  desired_end date NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_alerts_unique UNIQUE (user_id, dress_id, desired_start, desired_end)
);

CREATE INDEX availability_alerts_user_idx ON public.availability_alerts(user_id, created_at DESC);
CREATE INDEX availability_alerts_dress_idx ON public.availability_alerts(dress_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_alerts TO authenticated;
GRANT ALL ON public.availability_alerts TO service_role;

ALTER TABLE public.availability_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alerts"
  ON public.availability_alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own alerts"
  ON public.availability_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON public.availability_alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
