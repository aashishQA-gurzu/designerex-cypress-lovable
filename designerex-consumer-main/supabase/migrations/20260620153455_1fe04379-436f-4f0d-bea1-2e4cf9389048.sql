
CREATE OR REPLACE FUNCTION public.dx_my_active_rentals()
RETURNS TABLE (
  booking_id uuid,
  dress_id uuid,
  dress_title text,
  dress_image text,
  lender_id uuid,
  lender_name text,
  lender_avatar text,
  start_date date,
  end_date date,
  phase text,
  days_until_start int,
  days_until_return int,
  outbound_tracking text,
  outbound_status text,
  return_tracking text,
  return_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE $q$
    SELECT
      b.id AS booking_id,
      d.id AS dress_id,
      d.title AS dress_title,
      (SELECT di.url FROM public.dress_images di WHERE di.dress_id = d.id ORDER BY di.position NULLS LAST LIMIT 1) AS dress_image,
      lp.id AS lender_id,
      COALESCE(NULLIF(TRIM(CONCAT(lp.first_name, ' ', lp.last_name)), ''), 'Lender') AS lender_name,
      lp.avatar_url AS lender_avatar,
      b.start_date,
      b.end_date,
      CASE
        WHEN CURRENT_DATE < b.start_date THEN 'upcoming'
        WHEN CURRENT_DATE >= b.start_date AND CURRENT_DATE < b.end_date THEN 'in_use'
        ELSE 'return_due'
      END AS phase,
      (b.start_date - CURRENT_DATE)::int AS days_until_start,
      (b.end_date - CURRENT_DATE)::int AS days_until_return,
      NULL::text AS outbound_tracking,
      NULL::text AS outbound_status,
      NULL::text AS return_tracking,
      NULL::text AS return_status
    FROM public.bookings b
    JOIN public.dresses d ON d.id = b.dress_id
    LEFT JOIN public.profiles lp ON lp.id = b.lender_id
    WHERE b.renter_id = auth.uid()
      AND b.status IN ('accepted','active')
      AND b.end_date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY (b.end_date - CURRENT_DATE) ASC, b.start_date ASC
  $q$;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dx_my_active_rentals() TO authenticated;
