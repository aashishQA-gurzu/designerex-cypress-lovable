CREATE TABLE public.instagram_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url text NOT NULL,
  post_url text NOT NULL,
  caption text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.instagram_posts TO anon, authenticated;
GRANT ALL ON public.instagram_posts TO service_role;

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active instagram posts"
  ON public.instagram_posts FOR SELECT
  USING (active = true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_instagram_posts_updated_at
  BEFORE UPDATE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();