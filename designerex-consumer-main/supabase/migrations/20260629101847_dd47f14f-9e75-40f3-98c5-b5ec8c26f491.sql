
CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT ALL ON public.faqs TO service_role;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published faqs" ON public.faqs
  FOR SELECT USING (is_published = true);

INSERT INTO public.faqs (category, position, question, answer) VALUES
('General', 1, 'What is Designerex?', 'Designerex is Australia''s peer-to-peer designer dress rental marketplace. Rent stunning designer pieces from women across the country, or lend out your own wardrobe and earn — all in one place.'),
('General', 2, 'Do I need an account to browse?', 'You can browse freely without an account. You''ll just need a free account to book a dress or create a listing.'),
('General', 3, 'Can I rent and lend with the same account?', 'Yes. One account does both — rent something for an event one week, lend your wardrobe the next.'),
('Renting', 1, 'How long can I rent a dress for?', 'Rentals come in set lengths that you choose when you book. Pick the option that suits your event at checkout.'),
('Renting', 2, 'When am I charged?', 'When you book, we place a hold on your card — you''re only charged once the lender confirms your booking. If they can''t fulfil it, the hold is released and you pay nothing.'),
('Renting', 3, 'Do I need to clean the dress before returning it?', 'Whether dry cleaning is included depends on the listing — you''ll see this in the listing details before you book. If you''re unsure, just message the lender.'),
('Renting', 4, 'What if I''m not sure about the fit?', 'Every listing includes size and fit details, and you can message the lender with any questions before you book. If something isn''t right when it arrives, contact our support team.'),
('Renting', 5, 'How do I return the dress?', 'Every order includes a prepaid return label. Pack the dress back up, drop it off, and you''re done.'),
('Lending', 1, 'How do I list a dress?', 'Create a listing in minutes — add photos, set your sizes, pricing and availability, and publish. Your wardrobe starts earning instead of sitting in the closet.'),
('Lending', 2, 'How and when do I get paid?', 'Once a rental completes, your earnings are paid to your nominated bank account on a regular weekly payout.'),
('Lending', 3, 'Can I pause my listings while I''m away?', 'Yes. Switch on Vacation Mode and all your listings are hidden from renters until you turn it back off — no need to unpublish each one individually.'),
('Lending', 4, 'Do I get to choose who rents my dresses?', 'Yes. You review and approve every booking request before anything is confirmed.'),
('Payments & security', 1, 'Is it safe to pay through Designerex?', 'Yes. Payments are processed by Stripe, a global leader in secure online payments. We never see or store your full card details.'),
('Payments & security', 2, 'Are other members verified?', 'Renters and lenders go through ID verification, so you always know who you''re dealing with.'),
('Payments & security', 3, 'What if something goes wrong with a booking?', 'Get in touch with our support team and we''ll help you sort it out.'),
('Shipping & returns', 1, 'How is the dress delivered?', 'Dresses are delivered to your door with a prepaid label included for the return. Some lenders also offer local pickup.'),
('Shipping & returns', 2, 'How quickly will it arrive?', 'Delivery timing depends on the option you choose and your location — you''ll see the estimate before you book.');
