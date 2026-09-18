import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VerifyEmailModal } from "@/components/auth/VerifyEmailPrompt";
import { useEmailVerified, isEmailNotVerifiedError } from "@/hooks/useEmailVerified";
import { useQuery } from "@tanstack/react-query";
import { addDays, eachDayOfInterval, format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from "date-fns";
import { Check, ChevronLeft, Clock, Loader2, Lock, ShieldCheck, Users, CreditCard, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { shippingName as shippingLabel } from "@/lib/shipping-labels";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { resilientAddressWrite } from "@/lib/address-write";
import { useFeePreviewState, fetchFeePreview, type FeePreviewStatus } from "@/lib/fee-preview";
import { useTryOnForDress } from "@/lib/try-on";
import { formatTryOnWhen } from "@/components/dashboard/TryOnBadge";
import { useDateHold, SAVED_CHECKOUT_EXPIRED_MESSAGE } from "@/lib/date-hold";
import { fetchBlockReason, blockReasonMessage, DATE_BLOCK_REASONS } from "@/lib/block-reasons";
import { fetchBlockedDatesForSize } from "@/lib/sizes";
import { SimpleSelect } from "@/components/ui/simple-select";



const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

type HireOption = "a" | "b" | "tryon";
type ShippingType = "standard" | "express" | "pickup" | "two_hour_uber";

type CheckoutSearch = {
  dress_id?: string;
  from?: string;
  to?: string;
  hire_option?: HireOption;
  shipping_option?: ShippingType;
  tryon_date?: string;
  tryon_period?: "am" | "pm";
  size_id?: string;
};

export const Route = createFileRoute("/_authenticated/checkout/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): CheckoutSearch => ({
    dress_id: typeof s.dress_id === "string" ? s.dress_id : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    // "try_on" is the canonical URL/database value; "tryon" is the legacy internal key.
    hire_option:
      s.hire_option === "try_on" || s.hire_option === "tryon"
        ? "tryon"
        : (["a", "b"] as readonly string[]).includes(s.hire_option as string)
          ? (s.hire_option as HireOption)
          : undefined,
    shipping_option: (["standard", "express", "pickup", "two_hour_uber"] as const).includes(s.shipping_option as ShippingType)
      ? (s.shipping_option as ShippingType) : undefined,
    tryon_date: typeof s.tryon_date === "string" ? s.tryon_date : undefined,
    tryon_period: s.tryon_period === "am" || s.tryon_period === "pm" ? s.tryon_period : undefined,
    size_id: typeof s.size_id === "string" ? s.size_id : undefined,
  }),

  component: CheckoutPage,
});



function CheckoutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const tryOnParamDate = search.tryon_date ?? search.from;

  // Validate required params
  const validParams = useMemo(() => {
    if (!search.dress_id || !search.hire_option) return false;
    // A try-on cannot proceed without a morning/afternoon choice.
    if (search.hire_option === "tryon") return !!tryOnParamDate && !!search.tryon_period;
    return !!search.from && !!search.to && !!search.shipping_option;
  }, [search, tryOnParamDate]);

  useEffect(() => {
    if (!validParams && search.dress_id) {
      navigate({ to: "/dresses/$id", params: { id: search.dress_id } });
    } else if (!validParams) {
      navigate({ to: "/browse" });
    }
  }, [validParams, search.dress_id, navigate]);

  /* ----- editable booking state (pre-filled from URL) ----- */
  const [hireOption, setHireOption] = useState<HireOption>(search.hire_option ?? "a");
  const isTryOn = hireOption === "tryon";
  const [startDate, setStartDate] = useState<Date | undefined>(search.from ? parseISO(search.from) : undefined);
  const [shippingType, setShippingType] = useState<ShippingType>(
    search.hire_option === "tryon" ? "pickup" : (search.shipping_option ?? "standard"),
  );
  const [tryOnDate, setTryOnDate] = useState<Date | undefined>(tryOnParamDate ? parseISO(tryOnParamDate) : undefined);
  const tryOnPeriod = search.tryon_period ?? null;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [editingDate, setEditingDate] = useState(false);

  /* ----- fetch dress ----- */
  const { data: dress, isLoading } = useQuery({
    queryKey: ["checkout-dress", search.dress_id],
    enabled: !!search.dress_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dresses")
        .select(`
          *,
          brand:brands!dresses_brand_id_fkey(id, name),
          size:sizes!dresses_size_id_fkey(id, name),
          lender:profiles!dresses_lender_id_fkey(*),
          images:dress_images(url, position),
          shipping_options:dress_shipping_options(shipping_type, price, transit_days, is_enabled)
        `)
        .eq("id", search.dress_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  /* ----- saved addresses ----- */
  const { data: savedAddresses } = useQuery({
    queryKey: ["user-addresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_addresses").select("*").eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
  });

  /* ----- availability blockers (for date editing) ----- */
  const lenderId = dress?.lender?.id as string | undefined;
  const { data: blockers } = useQuery({
    queryKey: ["checkout-availability", search.dress_id, lenderId, search.size_id],
    enabled: !!dress,
    queryFn: async () => {
      const iso = await fetchBlockedDatesForSize(search.dress_id!, search.size_id ?? null);
      return iso.map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      });
    },
  });

  const hireDaysA = (dress?.lender?.hire_period_a_days as number | undefined) ?? 4;
  const hireDaysB = (dress?.lender?.hire_period_b_days as number | undefined) ?? 8;
  const hireBAvailable = Number(dress?.hire_price_b ?? 0) > 0;
  const { data: tryOn } = useTryOnForDress(search.dress_id, !!user);
  const tryOnAvailable = !!tryOn?.try_on_offered;
  const hireDays = hireOption === "a" ? hireDaysA : hireOption === "b" ? hireDaysB : 0;

  // Never leave the renter on a hire option this listing has no price for.
  useEffect(() => {
    if (!dress) return;
    if (hireOption === "b" && !hireBAvailable) setHireOption("a");
    if (hireOption === "tryon" && tryOn && !tryOnAvailable) setHireOption("a");
  }, [dress, hireOption, hireBAvailable, tryOn, tryOnAvailable]);

  // Try-ons are pickup only.
  useEffect(() => {
    if (isTryOn && shippingType !== "pickup") setShippingType("pickup");
  }, [isTryOn, shippingType]);


  const endDate = useMemo(() => {
    if (hireOption === "tryon" || !startDate || !hireDays) return undefined;
    return addDays(startDate, hireDays - 1);
  }, [startDate, hireDays, hireOption]);

  const shippingOptions = useMemo(() => {
    const so = (dress?.shipping_options ?? []) as any[];
    return so.filter((s) => s.is_enabled !== false);
  }, [dress]);

  useEffect(() => {
    if (isTryOn) return;
    if (shippingOptions.length && !shippingOptions.find((s) => s.shipping_type === shippingType)) {
      setShippingType(shippingOptions[0].shipping_type as ShippingType);
    }
  }, [shippingOptions, shippingType, isTryOn]);

  /* ----- pricing ----- */
  const hirePrice = useMemo(() => {
    if (isTryOn) return Number(tryOn?.try_on_price ?? 0);
    if (!dress) return 0;
    if (hireOption === "a") return Number(dress.hire_price_a ?? 0);
    return Number(dress.hire_price_b ?? 0);
  }, [dress, hireOption, isTryOn, tryOn]);
  const shippingPrice = useMemo(() => {
    if (hireOption === "tryon" || shippingType === "pickup") return 0;
    const opt = shippingOptions.find((s) => s.shipping_type === shippingType);
    return Number(opt?.price ?? 0);
  }, [shippingOptions, shippingType, hireOption]);
  const cleaningFee = isTryOn ? 0 : Number(dress?.cleaning_fee ?? 0);
  const isTwoHour = !isTryOn && shippingType === "two_hour_uber";
  const twoHourFee = isTwoHour ? shippingPrice : 0;
  const shippingOnly = isTwoHour ? 0 : shippingPrice;
  const { fee: feePreview, status: feeStatus } = useFeePreviewState(hirePrice, cleaningFee, shippingOnly, twoHourFee);
  const rentalPrice = feePreview?.rental_price ?? null;
  const advertisedRental = isTryOn ? Number(tryOn?.try_on_price ?? 0) : (feePreview?.advertised_rental ?? null);
  const serviceFee = isTryOn ? Number(tryOn?.renter_service_fee ?? 0) : (feePreview?.renter_booking_fee ?? null);
  const renterTotal = isTryOn ? Number(tryOn?.renter_total ?? 0) : (feePreview?.renter_total ?? null);

  const bondAmount = useMemo(() => {
    if (!dress?.rrp || hireOption === "tryon") return 0;
    return Math.min(Math.round(Number(dress.rrp) * 0.5), 500);
  }, [dress, hireOption]);

  /* ----- resumable saved checkout ----- */
  const holdStart = isTryOn
    ? (tryOnDate ? format(tryOnDate, "yyyy-MM-dd") : undefined)
    : (startDate ? format(startDate, "yyyy-MM-dd") : undefined);
  const holdEnd = isTryOn
    ? holdStart
    : (endDate ? format(endDate, "yyyy-MM-dd") : undefined);
  const hold = useDateHold({
    dressId: search.dress_id,
    start: holdStart,
    end: holdEnd,
    enabled: !!dress,
  });

  useEffect(() => {
    if (hold.status === "expired") {
      toast.error(SAVED_CHECKOUT_EXPIRED_MESSAGE);
      if (search.dress_id) navigate({ to: "/dresses/$id", params: { id: search.dress_id } });
    }
  }, [hold.status, search.dress_id, navigate]);



  /* ----- date editing ----- */
  const minDate = useMemo(() => addDays(startOfDay(new Date()), 2), []);
  const maxDate = useMemo(() => addDays(startOfDay(new Date()), 90), []);
  const disabledDays = blockers ?? [];
  const isDayDisabled = (d: Date) => {
    const day = startOfDay(d);
    if (isBefore(day, minDate) || isAfter(day, maxDate)) return true;
    return disabledDays.some((x) => isSameDay(x, day));
  };
  const rangeHasConflict = (from: Date, days: number) => {
    const to = addDays(from, days - 1);
    return eachDayOfInterval({ start: from, end: to }).some((d) =>
      disabledDays.some((x) => isSameDay(x, d)) || isAfter(startOfDay(d), maxDate));
  };
  const [dateError, setDateError] = useState<string | null>(null);
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);

  const handlePickStart = (d: Date | undefined) => {
    if (!d) return;
    if (hireOption !== "tryon" && rangeHasConflict(d, hireDays)) {
      setDateError("Some days in this range aren't available. Try another start date.");
      return;
    }
    setStartDate(d);
    setDateError(null);
    setEditingDate(false);
  };
  const rangeModifiers = useMemo(() => {
    if (!startDate || !endDate) return undefined;
    const all = eachDayOfInterval({ start: startDate, end: endDate });
    return { range_start: startDate, range_end: endDate, range_middle: all.slice(1, -1) };
  }, [startDate, endDate]);

  /* ----- step 2: address ----- */
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [addr, setAddr] = useState({
    label: "",
    address_line_1: "",
    address_line_2: "",
    suburb: "",
    postcode: "",
    state: "",
    country: "Australia",
  });
  const [saveAddress, setSaveAddress] = useState(true);
  const [phone, setPhone] = useState<string>(profile?.mobile_number ?? "");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // Preserve city_id on existing saved addresses so we don't drop it on update.
  const [savedAddressCityId, setSavedAddressCityId] = useState<string | null>(null);

  const loadAddrFromRow = (a: any) => ({
    label: a.label ?? "",
    address_line_1: a.address_line_1 ?? "",
    address_line_2: a.address_line_2 ?? "",
    suburb: a.suburb ?? "",
    postcode: a.postcode ?? "",
    state: a.state ?? "",
    country: a.country ?? "Australia",
  });

  useEffect(() => {
    if (!savedAddresses?.length) return;
    if (selectedAddressId === "new") {
      const defaultAddr: any =
        savedAddresses.find((a: any) => a.is_default) ?? savedAddresses[0];
      setSelectedAddressId(defaultAddr.id);
      setAddr(loadAddrFromRow(defaultAddr));
      setSavedAddressCityId(defaultAddr.city_id ?? null);
      setSaveAddress(false);
    }
  }, [savedAddresses]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    if (id === "new") {
      setAddr({
        label: "",
        address_line_1: "",
        address_line_2: "",
        suburb: "",
        postcode: "",
        state: "",
        country: "Australia",
      });
      setSavedAddressCityId(null);
      setSaveAddress(true);
    } else {
      const a: any = savedAddresses?.find((x) => x.id === id);
      if (a) {
        setAddr(loadAddrFromRow(a));
        setSavedAddressCityId(a.city_id ?? null);
        setSaveAddress(false);
      }
    }
  };

  /* ----- step 3: payment ----- */
  const [discountInput, setDiscountInput] = useState("");
  const [discount, setDiscount] = useState<{ id: string; code: string; amount: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [card, setCard] = useState({ name: "", number: "", expiry: "", cvc: "", postcode: "" });
  const [agreed, setAgreed] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const { verified: emailVerified } = useEmailVerified();
  const [submitting, setSubmitting] = useState(false);

  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code || !user) return;
    setApplyingDiscount(true);
    setDiscountError(null);
    // Ownership + validity are decided by the database.
    const { data: validated, error: vErr } = await supabase.rpc("validate_discount_code", {
      p_code: code,
    } as any);
    const row: any = Array.isArray(validated) ? validated[0] : validated;
    const codeId = row?.id ?? row?.discount_code_id ?? (typeof row === "string" ? row : null);
    if (vErr || !codeId) {
      setApplyingDiscount(false);
      setDiscountError("This code isn't valid for your account.");
      setDiscount(null);
      return;
    }
    const { data: amtData, error: aErr } = await supabase.rpc("dx_discount_amount", {
      p_code_id: codeId,
      p_uid: user.id,
      p_rental: hirePrice,
      p_cleaning: cleaningFee,
    } as any);
    setApplyingDiscount(false);
    const amount = Number(Array.isArray(amtData) ? amtData[0] : amtData);
    if (aErr || !Number.isFinite(amount) || amount <= 0) {
      setDiscountError("This code isn't valid for your account.");
      setDiscount(null);
      return;
    }
    setDiscount({ id: codeId, code, amount });
  };

  const total = renterTotal == null || applyingDiscount ? null : Math.max(0, renterTotal - (discount?.amount ?? 0));


  /* ----- availability gate (checked on mount and again before payment) ----- */
  const selectedStartISO = isTryOn
    ? (tryOnDate ? format(tryOnDate, "yyyy-MM-dd") : null)
    : (startDate ? format(startDate, "yyyy-MM-dd") : null);
  const selectedEndISO = isTryOn
    ? selectedStartISO
    : (endDate ? format(endDate, "yyyy-MM-dd") : null);

  const applyBlockReason = useCallback((reason: string) => {
    const msg = blockReasonMessage(reason);
    if ((DATE_BLOCK_REASONS as string[]).includes(reason)) {
      setBlockNotice(null);
      setDateError(msg);
      setEditingDate(true);
      setStep(1);
    } else {
      setDateError(null);
      setBlockNotice(msg);
    }
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, []);

  const { data: mountBlockReason } = useQuery({
    queryKey: ["checkout-block-reason", search.dress_id, selectedStartISO, selectedEndISO, search.size_id],
    enabled: !!search.dress_id && !!selectedStartISO && !!selectedEndISO,
    staleTime: 0,
    queryFn: () =>
      fetchBlockReason({
        dressId: search.dress_id!,
        start: selectedStartISO!,
        end: selectedEndISO!,
        sizeId: search.size_id ?? null,
      }),
  });

  useEffect(() => {
    if (mountBlockReason) applyBlockReason(mountBlockReason);
  }, [mountBlockReason, applyBlockReason]);

  const checkoutBlocked = !!mountBlockReason;

  /* ----- validation (errors surface only after an attempt) ----- */
  const [attempted, setAttempted] = useState<{ 1: boolean; 2: boolean; 3: boolean }>({ 1: false, 2: false, 3: false });
  const markAttempted = (s: 1 | 2 | 3) => setAttempted((a) => ({ ...a, [s]: true }));

  const phoneDigits = phone.replace(/\D/g, "");

  const step1Errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (hireOption === "tryon" && !tryOnDate) e['dates'] = "Please select your try-on date to continue.";
    if (hireOption === "tryon" && !tryOnPeriod) e['period'] = "Please choose morning or afternoon to continue.";
    if (hireOption !== "tryon" && !startDate) e['dates'] = "Please select your hire dates to continue.";
    return e;
  }, [hireOption, startDate, tryOnDate, tryOnPeriod]);


  const step2Errors = useMemo(() => {
    const e: Record<string, string> = {};
    const needAddress = shippingType !== "pickup";
    if (needAddress && !addr.address_line_1) e['address_line_1'] = "Please enter a street address.";
    if (needAddress && shippingType !== "two_hour_uber") {
      if (!addr.suburb) e['suburb'] = "Please enter a suburb.";
      if (!addr.state) e['state'] = "Please select a state.";
      if (!/^\d{4}$/.test(addr.postcode)) e['postcode'] = "Please enter a 4-digit postcode.";
    }
    if (phoneDigits.length < 10) e['phone'] = "Please enter a valid contact phone number.";
    return e;
  }, [shippingType, addr, phoneDigits]);

  const step3Errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!card.name) e['cardName'] = "Please enter the cardholder name.";
    if (!card.number) e['cardNumber'] = "Please enter your card number.";
    if (!card.expiry) e['cardExpiry'] = "Please enter the expiry date.";
    if (!card.cvc) e['cardCvc'] = "Please enter the CVC.";
    if (!agreed) e['agreed'] = "Please accept the terms and conditions to continue.";
    return e;
  }, [card, agreed]);

  const step1Valid = Object.keys(step1Errors).length === 0;
  const step2Valid = Object.keys(step2Errors).length === 0;
  const step3Valid = Object.keys(step3Errors).length === 0;

  const err = (step: 1 | 2 | 3, errors: Record<string, string>, key: string) =>
    attempted[step] ? errors[key] : undefined;


  /* ----- submit ----- */
  // shipping_type matches dress_shipping_options.shipping_type exactly.


  const tryInsertBooking = async (payload: Record<string, any>) => {
    // Attempt insert; if Supabase complains about an unknown column,
    // drop that column and retry (up to a few times). This makes the
    // submit resilient to schema drift between checkout payload and DB.
    let attempt = { ...payload };
    for (let i = 0; i < 6; i++) {
      const { data, error } = await supabase
        .from("bookings").insert(attempt).select().single();
      console.log("INSERT RESULT", { data, error, attempt });
      if (!error && data) return data;
      const msg = error?.message ?? "";
      const m = msg.match(/'([^']+)' column of 'bookings'/) ?? msg.match(/column "?([a-z_]+)"? of relation "bookings"/i);
      if (m && m[1] in attempt) {
        delete attempt[m[1]];
        continue;
      }
      throw error ?? new Error("Booking insert failed");
    }
    throw new Error("Booking insert failed after retries");
  };

  const handleSubmit = async () => {
    console.log("SUBMIT START", { user: user?.id, dress: dress?.id, hireOption, shippingType });
    markAttempted(3);
    if (!user) { toast.error("You must be signed in."); return; }
    if (!dress) { toast.error("Dress not loaded."); return; }
    if (!step3Valid) return;
    if (!emailVerified) { setVerifyOpen(true); return; }
    setSubmitting(true);
    try {
      const rand = () => Math.random().toString(36).slice(2, 12);
      const bookingPayload: Record<string, any> = {
        dress_id: dress.id,
        renter_id: user.id,
        lender_id: dress.lender_id,
        ...(isTryOn ? {} : { rental_fee: hirePrice, cleaning_fee: cleaningFee }),
        // shipping_fee, money, payout, and deposit fields are set by DB triggers — do not write from frontend.
        status: "requested",
        shipping_type: isTryOn ? "pickup" : shippingType,
        ...(isTwoHour ? { two_hour_delivery_fee: twoHourFee } : {}),
        hire_option: hireOption === "a" ? "hire_a" : hireOption === "b" ? "hire_b" : "try_on",
        ...(search.size_id ? { size_id: search.size_id } : {}),
        stripe_payment_intent_id: `pi_mock_${rand()}`,
      };
      if (hireOption === "tryon") {
        const tDate = tryOnDate ?? new Date();
        bookingPayload.start_date = format(tDate, "yyyy-MM-dd");
        bookingPayload.end_date = format(tDate, "yyyy-MM-dd");
        // The database accepts only the explicit morning/afternoon period.
        bookingPayload.try_on_period = tryOnPeriod;
      } else {
        if (!startDate || !endDate) { setSubmitting(false); toast.error("Pick a hire date."); return; }
        if (isBefore(startOfDay(endDate), startOfDay(startDate))) {
          setSubmitting(false);
          setDateError("The return date must be after the pick-up date. Please choose your dates again.");
          setEditingDate(true);
          setStep(1);
          requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
          return;
        }
        bookingPayload.start_date = format(startDate, "yyyy-MM-dd");
        bookingPayload.end_date = format(endDate, "yyyy-MM-dd");
      }

      // Only the code id is sent — the database calculates discount_amount_applied.
      if (discount) bookingPayload.discount_code_id = discount.id;

      if (deliveryNotes) bookingPayload.delivery_notes = deliveryNotes;

      // Re-check availability immediately before taking payment.
      const liveReason = await fetchBlockReason({
        dressId: dress.id,
        start: bookingPayload.start_date,
        end: bookingPayload.end_date,
        sizeId: search.size_id ?? null,
      });
      if (liveReason) {
        setSubmitting(false);
        applyBlockReason(liveReason);
        return;
      }

      const booking = await tryInsertBooking(bookingPayload);
      await finalizeBooking(booking);
    } catch (e: any) {
      console.error("SUBMIT CATCH", e);
      const raw = `${e?.hint ?? ""} ${e?.message ?? ""} ${e?.details ?? ""}`;
      const hintOf = (h: string) => e?.hint === h || raw.includes(h);
      const dateHints: Record<string, string> = {
        lender_vacation: "The lender is away for some of those dates. Please choose different dates.",
        dates_blacked_out: "Some of those dates are unavailable. Please choose different dates.",
        dates_unavailable: "Those dates are no longer available. Please choose different dates.",
        invalid_date_range: "The return date must be after the pick-up date. Please choose your dates again.",
      };
      const pageHints: Record<string, string> = {
        dress_inactive: "This listing is no longer available.",
        lender_inactive: "This listing is no longer available.",
        lender_paused: "This lender isn't currently accepting bookings.",
      };
      const badRange =
        hintOf("invalid_date_range") ||
        /end_date/.test(raw) && /check|constraint|before|>=/i.test(raw);
      const dateHit = badRange ? "invalid_date_range" : Object.keys(dateHints).find(hintOf);
      const pageHit = Object.keys(pageHints).find(hintOf);

      const showDateError = (msg: string) => {
        setBlockNotice(null);
        setShippingError(null);
        setDateError(msg);
        setEditingDate(true);
        setStep(1);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      };

      if (isEmailNotVerifiedError(e)) {
        setVerifyOpen(true);
      } else if (dateHit) {
        showDateError(dateHints[dateHit]!);
      } else if (pageHit) {
        setBlockNotice(pageHints[pageHit]!);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      } else if (hintOf("shipping_option_unavailable")) {
        setShippingError("That delivery option isn't available for this dress.");
        setStep(1);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      } else if (hintOf("discount_invalid")) {
        setDiscount(null);
        setDiscountError("This discount code isn't valid for your account.");
      } else {
        toast.error("Couldn't submit your request. Please try again.");
      }

      setSubmitting(false);
    }

  };

  const finalizeBooking = async (booking: any) => {
    // Conversation
    const { data: conv } = await supabase.from("conversations").insert({
      type: "booking",
      booking_id: booking.id,
      dress_id: dress.id,
      renter_id: user!.id,
      lender_id: dress.lender_id,
    }).select().single();
    if (conv) {
      await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user!.id },
        { conversation_id: conv.id, user_id: dress.lender_id },
      ]);
    }
    // Notification
    const firstName = profile?.first_name ?? "A renter";
    const notif = await supabase.from("notifications").insert({
      user_id: dress.lender_id,
      type: "booking_request",
      title: "New booking request",
      body: `${firstName} has requested to book your ${dress.title} for ${booking.start_date} to ${booking.end_date}.`,
      link_url: `/dashboard/booking-requests/${booking.id}`,
    });
    if (notif.error) console.warn("notification insert failed", notif.error);
    // used_count is incremented by the database when the booking is created.

    // Save address
    if (saveAddress && selectedAddressId === "new" && shippingType !== "pickup" && shippingType !== "two_hour_uber" && addr.address_line_1) {
      await resilientAddressWrite({
        user_id: user!.id,
        label: addr.label || null,
        address_line_1: addr.address_line_1,
        address_line_2: addr.address_line_2 || null,
        suburb: addr.suburb, postcode: addr.postcode,
        state: addr.state,
        country: addr.country,
        city_id: null,
      });
    }
    // The database releases the hold when the booking is created.
    hold.markCompleted();
    navigate({ to: "/checkout/confirmed", search: { booking_id: booking.id } as any });
  };

  if (isLoading || !dress) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-pink" />
      </div>
    );
  }

  const heroImg = ((dress.images ?? []) as any[]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
  const sizeName = dress.size?.name;
  const brandName = dress.brand?.name;
  const lenderName = dress.lender?.first_name ?? "lender";

  const hireOptionLabel = hireOption === "a" ? `${hireDaysA} day hire`
    : hireOption === "b" ? `${hireDaysB} day hire` : "Try-on";

  const dateLabel = hireOption === "tryon" && tryOnDate
    ? `Try-on: ${formatTryOnWhen(format(tryOnDate, "EEE d MMM"), tryOnPeriod)}`
    : startDate && endDate
    ? `${format(startDate, "EEE d MMM")} → ${format(endDate, "EEE d MMM")} · ${hireDays} days`
    : "Pick a date";

  // Map internal steps (1=hire/2=delivery/3=payment) to spec indicator (1=Shipping, 2=Payment, 3=Review)
  const indicatorStep: 1 | 2 | 3 = step === 3 ? 2 : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <Link to="/dresses/$id" params={{ id: dress.id }} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Back to dress
      </Link>

      {/* Title */}
      <div className="text-center">
        <h1 className="font-display text-4xl sm:text-5xl text-ink">Checkout</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === 3
            ? "Almost there! Complete your payment to send your booking request."
            : "Almost there! Let's get your order to the right place."}
        </p>
      </div>

      {blockNotice && (
        <div role="alert" className="mx-auto mt-6 max-w-2xl rounded-md border border-destructive/40 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{blockNotice}</p>
          <Link to="/browse" className="mt-2 inline-block text-sm underline">Browse other dresses</Link>
        </div>
      )}

      {/* Stepper */}
      <div className="mt-8 flex justify-center">
        <Stepper step={indicatorStep} firstLabel={isTryOn ? "Pickup" : "Shipping"} />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12">

        {/* Left: wizard */}
        <div className="lg:col-span-7">
          {step === 1 && (
            <section className="space-y-8">
              <h2 className="font-display text-2xl">{isTryOn ? "Confirm your try-on" : "Confirm your hire"}</h2>

              {/* Hire option */}
              <div>
                <p className="mb-3 text-[11px] tracking-wider-display text-muted-foreground">HIRE OPTION</p>
                {isTryOn ? (
                  <p className="text-sm text-ink">Try-on · one day</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <RadioCard active={hireOption === "a"} onClick={() => setHireOption("a")}
                      title={`${hireDaysA} day hire`} subtitle={`$${Number((dress as any).advertised_hire_a ?? dress.hire_price_a ?? 0).toFixed(0)}`} />
                    {hireBAvailable && (
                      <RadioCard active={hireOption === "b"} onClick={() => setHireOption("b")}
                        title={`${hireDaysB} day hire`} subtitle={`$${Number((dress as any).advertised_hire_b ?? dress.hire_price_b ?? 0).toFixed(0)}`} />
                    )}
                  </div>
                )}
              </div>

              {/* Dates */}
              <div>
                <p className="mb-3 text-[11px] tracking-wider-display text-muted-foreground">HIRE DATES</p>
                <div className="rounded-md border bg-white p-4">
                  {isTryOn ? (
                    <div>
                      {editingDate ? (
                        <Calendar mode="single" selected={tryOnDate}
                          onSelect={(d) => { if (d) { setTryOnDate(d); setDateError(null); setEditingDate(false); } }}
                          disabled={isDayDisabled} className="mx-auto" />
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm">
                            {tryOnDate
                              ? formatTryOnWhen(format(tryOnDate, "EEE d MMM yyyy"), tryOnPeriod)
                              : "Pick a date"}
                          </p>
                          <button onClick={() => setEditingDate(true)} className="text-sm text-pink hover:underline">Change</button>
                        </div>
                      )}
                      {dateError && <p className="mt-2 text-sm text-destructive">{dateError}</p>}
                    </div>
                  ) : editingDate ? (
                    <div>
                      <Calendar mode="single" selected={startDate} onSelect={handlePickStart}
                        modifiers={rangeModifiers} disabled={isDayDisabled} className="mx-auto" />
                      {dateError && <p className="mt-2 text-sm text-destructive">{dateError}</p>}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm">{dateLabel}</p>
                        <button onClick={() => setEditingDate(true)} className="text-sm text-pink hover:underline">Change</button>
                      </div>
                      {dateError && <p className="mt-2 text-sm text-destructive">{dateError}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery method / pickup */}
              {isTryOn ? (
                <div>
                  <p className="mb-3 text-[11px] tracking-wider-display text-muted-foreground">PICKUP</p>
                  <div className="rounded-md border bg-white p-4">
                    <p className="text-sm text-ink">
                      In-person pickup — {tryOn?.try_on_location ?? "location provided by the lender"}
                    </p>
                    {tryOn?.try_on_address && (
                      <p className="mt-1 text-sm text-muted-foreground">{tryOn.try_on_address}</p>
                    )}
                  </div>
                  {shippingError && <p role="alert" className="mt-2 text-sm text-destructive">{shippingError}</p>}
                </div>
              ) : shippingOptions.length > 0 ? (
                <div>
                  <p className="mb-3 text-[11px] tracking-wider-display text-muted-foreground">DELIVERY METHOD</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {shippingOptions.map((s: any) => (
                      <RadioCard key={s.shipping_type} active={shippingType === s.shipping_type}
                        onClick={() => { setShippingError(null); setShippingType(s.shipping_type); }}
                        title={shippingLabel(s.shipping_type)}
                        subtitle={`$${(s.shipping_type === "pickup" ? 0 : Number(s.price ?? 0)).toFixed(2)}${s.transit_days ? ` · ${s.transit_days} day${s.transit_days > 1 ? "s" : ""}` : ""}`} />
                    ))}
                  </div>
                  {shippingError && <p role="alert" className="mt-2 text-sm text-destructive">{shippingError}</p>}
                </div>
              ) : null}


              <button
                onClick={() => { markAttempted(1); if (step1Valid) setStep(2); }}
                aria-disabled={!step1Valid}
                className={cn("btn-primary w-full sm:w-auto sm:px-10", !step1Valid && "opacity-50 cursor-not-allowed")}
              >
                {isTryOn ? "Continue to payment" : "Continue to delivery"}
              </button>
              {err(1, step1Errors, "dates") && (
                <p className="mt-2 text-xs text-destructive">{step1Errors['dates']}</p>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <h2 className="font-display text-2xl">Delivery details</h2>

              {shippingType === "pickup" ? (
                <div className="space-y-4 rounded-md border bg-white p-5">
                  <p className="text-[11px] tracking-wider-display text-muted-foreground">PICKUP ADDRESS</p>
                  <p className="text-sm">
                    {dress.lender?.suburb ?? "Address"}, {dress.lender?.state ?? ""} {dress.lender?.postcode ?? ""}
                    <br /><span className="text-muted-foreground">Exact address shared after booking is confirmed.</span>
                  </p>
                  <Field label="Contact phone" error={err(2, step2Errors, "phone")}>
                    <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                </div>
              ) : shippingType === "two_hour_uber" ? (
                <div className="space-y-4 rounded-md border bg-white p-5">
                  <p className="text-sm text-muted-foreground">2-hour Uber delivery requires you to be within 30km of the lender's location.</p>
                  <Field label="Delivery address" error={err(2, step2Errors, "address_line_1")}>
                    <input className="form-input" value={addr.address_line_1} onChange={(e) => setAddr({ ...addr, address_line_1: e.target.value })} />
                  </Field>
                  <Field label="Contact phone" error={err(2, step2Errors, "phone")}>
                    <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <div className="space-y-4 rounded-md border bg-white p-5">
                  {savedAddresses && savedAddresses.length > 0 && (
                    <Field label="Use saved address">
                      <SimpleSelect
                        aria-label="Use saved address"
                        value={selectedAddressId}
                        onValueChange={onPickSavedAddress}
                        options={[
                          ...savedAddresses.map((a: any) => {
                            const parts = [
                              a.address_line_1,
                              a.address_line_2,
                              [a.suburb, a.state, a.postcode].filter(Boolean).join(" "),
                            ].filter(Boolean).join(", ");
                            return { value: a.id, label: a.label ? `${a.label} — ${parts}` : parts };
                          }),
                          { value: "new", label: "+ Use a new address" },
                        ]}
                      />
                    </Field>
                  )}
                  <Field label="Label (e.g. Home, Work)"><input className="form-input" value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} /></Field>
                  <Field label="Street address" error={err(2, step2Errors, "address_line_1")}><input className="form-input" value={addr.address_line_1} onChange={(e) => setAddr({ ...addr, address_line_1: e.target.value })} /></Field>
                  <Field label="Apt / unit (optional)"><input className="form-input" value={addr.address_line_2} onChange={(e) => setAddr({ ...addr, address_line_2: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Suburb" error={err(2, step2Errors, "suburb")}><input className="form-input" value={addr.suburb} onChange={(e) => setAddr({ ...addr, suburb: e.target.value })} /></Field>
                    <Field label="State" error={err(2, step2Errors, "state")}>
                      <SimpleSelect
                        aria-label="State"
                        placeholder="Select state"
                        value={addr.state}
                        onValueChange={(v) => setAddr({ ...addr, state: v })}
                        options={AU_STATES.map((s) => ({ value: s, label: s }))}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Postcode" error={err(2, step2Errors, "postcode")}>
                      <input
                        className="form-input"
                        inputMode="numeric"
                        maxLength={4}
                        value={addr.postcode}
                        onChange={(e) => setAddr({ ...addr, postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      />
                    </Field>
                    <Field label="Country">
                      <input className="form-input bg-muted text-muted-foreground" value="Australia" readOnly />
                    </Field>
                  </div>
                  {selectedAddressId === "new" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                      Save this address for next time
                    </label>
                  )}
                  <Field label="Phone number" error={err(2, step2Errors, "phone")}><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                  <Field label="Delivery instructions (optional)">
                    <textarea className="form-input" rows={3} value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
                  </Field>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="rounded-md border px-6 py-2 text-sm">Back</button>
                <button
                  onClick={() => { markAttempted(2); if (step2Valid) setStep(3); }}
                  aria-disabled={!step2Valid}
                  className={cn("btn-primary flex-1 sm:flex-none sm:px-10", !step2Valid && "opacity-50 cursor-not-allowed")}
                >
                  Continue to payment
                </button>
              </div>
              {attempted[2] && !step2Valid && (
                <p className="text-xs text-destructive">Please complete the highlighted fields to continue.</p>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="space-y-6">
              <h2 className="font-display text-2xl text-ink">Payment Method</h2>

              {/* Payment method options */}
              <div className="space-y-3">
                <div className="rounded-[10px] border border-ink bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input type="radio" checked readOnly className="accent-[var(--color-magenta)]" />
                      <CreditCard className="h-4 w-4" />
                      Debit or Credit Card
                    </label>
                    <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground">
                      <span className="rounded border px-1.5 py-0.5">VISA</span>
                      <span className="rounded border px-1.5 py-0.5">MC</span>
                      <span className="rounded border px-1.5 py-0.5">AMEX</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[10px] border bg-surface p-4 opacity-60">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="radio" disabled className="accent-[var(--color-magenta)]" />
                    <span className="font-medium">Apple Pay</span>
                  </label>
                  <span className="rounded-full bg-bg-tint px-2 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>
                </div>

                <div className="flex items-center justify-between rounded-[10px] border bg-surface p-4 opacity-60">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="radio" disabled className="accent-[var(--color-magenta)]" />
                    <span className="font-medium">Afterpay</span>
                  </label>
                  <span className="rounded-full bg-bg-tint px-2 py-0.5 text-[10px] text-muted-foreground">Coming soon</span>
                </div>
              </div>

              {/* Discount */}
              <div className="rounded-[10px] border bg-surface p-5 shadow-sm">
                <p className="mb-2 text-[11px] tracking-wider-display text-muted-foreground">DISCOUNT CODE</p>
                {discount ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      <span className="font-medium text-magenta">{discount.code}</span> applied — −${discount.amount.toFixed(2)}
                    </p>
                    <button className="text-xs text-muted-foreground hover:text-ink" onClick={() => { setDiscount(null); setDiscountInput(""); }}>Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input className="form-input flex-1" placeholder="Enter code" value={discountInput} onChange={(e) => setDiscountInput(e.target.value.toUpperCase())} />
                    <button onClick={applyDiscount} disabled={applyingDiscount} className="btn-outline">
                      {applyingDiscount ? "…" : "Apply"}
                    </button>
                  </div>
                )}
                {discountError && <p className="mt-2 text-xs text-destructive">{discountError}</p>}
              </div>

              {/* Card */}
              <div className="space-y-4 rounded-[10px] border bg-surface p-5 shadow-sm">
                <p className="text-[11px] tracking-wider-display text-muted-foreground">CARD DETAILS</p>
                <Field label="Cardholder name" error={err(3, step3Errors, "cardName")}><input className="form-input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></Field>
                <Field label="Card number" error={err(3, step3Errors, "cardNumber")}><input className="form-input" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Expiry" error={err(3, step3Errors, "cardExpiry")}><input className="form-input" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></Field>
                  <Field label="CVC" error={err(3, step3Errors, "cardCvc")}><input className="form-input" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></Field>
                  <Field label="Postcode"><input className="form-input" value={card.postcode} onChange={(e) => setCard({ ...card, postcode: e.target.value })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" />
                  Save card for faster checkout
                </label>
              </div>

              {dress.requires_deposit && Number(dress.deposit_amount) > 0 && (
                <p className="text-xs text-ink-muted">
                  By booking, you authorise a refundable ${Number(dress.deposit_amount).toFixed(2)} hold on your card in addition to the amount above.
                </p>
              )}

              <div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    By proceeding, I acknowledge that I'll be charged the total amount once the lender accepts my request. I agree to the Designerex <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-magenta underline">Terms & Conditions</a> and <a href="/legal/refunds" target="_blank" rel="noopener noreferrer" className="text-magenta underline">Refund Policy</a>.
                  </span>
                </label>
                {err(3, step3Errors, "agreed") && (
                  <p className="mt-1.5 text-xs text-destructive">{step3Errors['agreed']}</p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button onClick={() => setStep(2)} className="btn-outline order-2 sm:order-1">Back</button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || checkoutBlocked}
                  aria-disabled={!step3Valid || checkoutBlocked}
                  className={cn("btn-magenta flex-1 order-1 sm:order-2", (!step3Valid || checkoutBlocked) && "opacity-50 cursor-not-allowed")}
                >
                  {submitting ? "Submitting…" : "CONFIRM & CONTINUE"}
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                You'll only be charged once your booking request is confirmed.
              </p>
            </section>
          )}
        </div>

        {/* Right: sticky summary */}
        <aside className="lg:col-span-5">
          {hold.status === "saved" && hold.msLeft > 0 && (
            <p className="mb-3 flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              We&apos;ll keep your selection for{" "}
              <span className="font-medium tabular-nums text-ink">{hold.countdown}</span>
            </p>
          )}
          <OrderSummary
            heroImg={heroImg}
            brandName={brandName}
            title={dress.title}
            sizeName={sizeName}
            dateLabel={dateLabel}
            hireOptionLabel={hireOptionLabel}
            hirePrice={advertisedRental}
            cleaningFee={cleaningFee}
            shippingPrice={shippingOnly}
            twoHourFee={twoHourFee}
            serviceFee={serviceFee}
            renterTotal={renterTotal}
            total={total}
            feeStatus={feeStatus}
            discount={discount}
            rrp={Number(dress.rrp ?? 0)}
            hireOption={hireOption}
            shippingType={shippingType}
            hireDays={hireDays}
            depositAmount={!isTryOn && dress.requires_deposit && Number(dress.deposit_amount) > 0 ? Number(dress.deposit_amount) : 0}
          />
        </aside>
      </div>

      {/* Trust strip */}
      <div className="mt-12 grid grid-cols-2 gap-4 border-t border-border pt-8 sm:grid-cols-4">
        {[
          { icon: Lock, t: "Secure payments" },
          { icon: Users, t: "Trusted by thousands" },
          { icon: CreditCard, t: "Pay later options" },
          { icon: ShieldCheck, t: "No acceptance = no charge" },
        ].map((it) => (
          <div key={it.t} className="flex items-center gap-2 text-xs text-muted-foreground">
            <it.icon className="h-4 w-4 text-magenta" />
            <span>{it.t}</span>
          </div>
        ))}
      </div>

      <VerifyEmailModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </div>
  );
}



/* ---------- helpers ---------- */
function Stepper({ step, firstLabel = "Shipping" }: { step: 1 | 2 | 3; firstLabel?: string }) {
  const items = [
    { n: 1, label: firstLabel },
    { n: 2, label: "Payment" },
    { n: 3, label: "Review" },
  ];

  return (
    <ol className="grid w-full min-w-0 grid-cols-3 items-center gap-2 sm:flex sm:gap-5">
      {items.map((it, i) => (
        <li key={it.n} className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            step === it.n
              ? "bg-magenta text-white"
              : step > it.n
                ? "bg-ink text-white"
                : "border border-border bg-surface text-muted-foreground",
          )}>
            {step > it.n ? <Check className="h-3.5 w-3.5" /> : it.n}
          </div>
          <span className={cn(
            "min-w-0 truncate text-xs sm:text-sm",
            step === it.n ? "font-medium text-magenta" : step > it.n ? "text-ink" : "text-muted-foreground",
          )}>{it.label}</span>
          {i < items.length - 1 && <span className="hidden h-px w-10 bg-border sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function OrderSummary(props: {
  heroImg?: string;
  brandName?: string;
  title: string;
  sizeName?: string;
  dateLabel: string;
  hireOptionLabel: string;
  hirePrice: number | null;
  cleaningFee: number;
  shippingPrice: number;
  twoHourFee: number;
  serviceFee: number | null;
  renterTotal: number | null;
  total: number | null;
  discount: { code: string; amount: number } | null;
  rrp: number;
  hireOption: HireOption;
  shippingType: ShippingType;
  hireDays: number;
  depositAmount: number;
  feeStatus: FeePreviewStatus;
}) {
  const {
    heroImg, brandName, title, sizeName, dateLabel, hireOptionLabel,
    hirePrice, cleaningFee, shippingPrice, twoHourFee, serviceFee, total, discount, rrp,
    hireOption, shippingType, hireDays, depositAmount, feeStatus,
  } = props;
  const pending = feeStatus === "error" ? "Unavailable" : feeStatus === "loading" ? "…" : "—";
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-24 rounded-[10px] border border-border bg-surface p-5 shadow-sm">
      <h3 className="font-heading text-sm tracking-wider-display text-ink uppercase mb-4">Order Summary</h3>
      <div className="flex gap-4">
        {heroImg && <img src={heroImg} alt="" className="h-24 w-24 rounded-[10px] object-cover" />}
        <div className="flex-1 min-w-0">
          {brandName && <p className="text-[10px] tracking-wider-display text-muted-foreground">{brandName.toUpperCase()}</p>}
          <p className="font-display text-base leading-tight text-ink">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sizeName && <>Size {sizeName} · </>}{dateLabel}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-medium text-ink">{hirePrice == null ? "—" : `$${hirePrice.toFixed(2)}`}</span>
            {rrp > 0 && (
              <span className="ml-2 text-xs text-muted-foreground line-through">RRP ${rrp.toFixed(0)}</span>
            )}
          </p>
        </div>
      </div>

      <button onClick={() => setOpen((o) => !o)} className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-ink">
        View Details <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <p className="mt-2 text-xs text-muted-foreground">
          {hireOptionLabel}{hireOption !== "tryon" ? ` · ${hireDays} days · ${shippingLabel(shippingType)}` : ""}
        </p>
      )}

      <div className="my-4 h-px bg-border" />

      {hireOption === "tryon" ? (
        <dl className="space-y-2 text-sm">
          <Row label="Try-on fee" value={hirePrice == null ? "—" : `$${hirePrice.toFixed(2)}`} />
          <Row label="Service fee" value={serviceFee == null ? "—" : `$${serviceFee.toFixed(2)}`} />
          <div className="h-px bg-border my-1" />
          <div className="flex items-center justify-between pt-1">
            <dt className="font-heading text-xs tracking-wider-display uppercase">Total</dt>
            <dd className="font-display text-2xl text-magenta">{total == null ? "—" : `$${total.toFixed(2)}`}</dd>
          </div>
        </dl>
      ) : (
        <>
          <dl className="space-y-2 text-sm">
            <Row label="Rental price" value={hirePrice == null ? pending : `$${hirePrice.toFixed(2)}`} />
            <Row label="Shipping" value={`$${shippingPrice.toFixed(2)}`} />
            {twoHourFee > 0 && <Row label="2-hour delivery" value={`$${twoHourFee.toFixed(2)}`} />}
            <Row label="Booking fee" value={serviceFee == null ? pending : `$${serviceFee.toFixed(2)}`} />
            {discount && <Row label={`Discount (${discount.code})`} value={`−$${discount.amount.toFixed(2)}`} className="text-magenta" />}
            <div className="h-px bg-border my-1" />
            <div className="flex items-center justify-between pt-1">
              <dt className="font-heading text-xs tracking-wider-display uppercase">Total</dt>
              <dd className="font-display text-2xl text-magenta">{total == null ? pending : `$${total.toFixed(2)}`}</dd>
            </div>
          </dl>

          {feeStatus === "error" && (
            <p className="mt-3 text-xs text-destructive">
              We couldn't calculate the price right now. Please refresh the page or try again in a moment.
            </p>
          )}
        </>
      )}


      {depositAmount > 0 && (
        <div className="mt-4 rounded-[10px] border border-dashed border-border bg-bg-tint p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Refundable security deposit</span>
            <span className="font-medium text-ink">${depositAmount.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Held on your card, not charged. Released after the dress is returned in good condition.
          </p>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-[10px] bg-bg-tint p-3 text-xs text-ink">
        <Lock className="h-3.5 w-3.5 mt-0.5 text-magenta flex-shrink-0" />
        <span>Your booking request will be sent to the lender once payment is confirmed.</span>
      </div>
    </div>
  );
}


function RadioCard({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-md border p-4 text-left transition-colors",
        active ? "border-ink bg-ink/[0.03]" : "border-border hover:border-ink/40")}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] tracking-wider-display text-muted-foreground">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function Row({ label, value, bold, large, className }: { label: string; value: string; bold?: boolean; large?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <dt className={cn(bold && "font-medium", large && "text-base")}>{label}</dt>
      <dd className={cn(bold && "font-medium", large && "font-display text-lg")}>{value}</dd>
    </div>
  );
}


