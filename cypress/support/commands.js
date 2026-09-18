import LoginPage from "../pages/LoginPage";

const SUPABASE_URL = Cypress.env("supabaseUrl");
const SUPABASE_ANON_KEY = Cypress.env("supabaseAnonKey");
const SUPABASE_PROJECT_ID = Cypress.env("supabaseProjectId");
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_ID}-auth-token`;

// --- Navigation --------------------------------------------------------------------
// Centralizes the DEV basic-auth wall so no Page Object/spec hardcodes it. Swapping to
// staging later only means clearing `authName`/`authPass` in cypress.config.js env.
Cypress.Commands.add("visitApp", (path = "/", options = {}) => {
  const authName = Cypress.env("authName");
  const authPass = Cypress.env("authPass");
  const finalOptions = { ...options };
  if (authName && authPass) {
    finalOptions.auth = { username: authName, password: authPass };
  }
  return cy.visit(path, finalOptions);
});

// --- Auth (real UI login, cached per role via cy.session) --------------------------
function loginAs(role, email, password) {
  cy.session(
    [role, email],
    () => {
      LoginPage.visit();
      LoginPage.login(email, password);
      // Verify the *actual* auth outcome (a real Supabase session token in storage),
      // not just a UI text change — avoids false positives on a broken login.
      cy.window()
        .its("localStorage")
        .invoke("getItem", AUTH_STORAGE_KEY)
        .should("exist");
    },
    {
      validate() {
        cy.window()
          .its("localStorage")
          .invoke("getItem", AUTH_STORAGE_KEY)
          .should("exist");
      },
    },
  );
}

Cypress.Commands.add("loginAsRenter", () => loginAs("renter", Cypress.env("renterEmail"), Cypress.env("renterPassword")));
Cypress.Commands.add("loginAsLender", () => loginAs("lender", Cypress.env("lenderEmail"), Cypress.env("lenderPassword")));
Cypress.Commands.add("loginAsAdmin", () => loginAs("admin", Cypress.env("adminEmail"), Cypress.env("adminPassword")));

/** key: "none" | "50" | "150" | "edge" | "exact" — see cypress.config.js's qaCredit*Email vars. */
Cypress.Commands.add("loginAsCreditAccount", (key) => {
  const email = Cypress.env(`qaCredit${key[0].toUpperCase()}${key.slice(1)}Email`);
  expect(email, `known credit account key "${key}"`).to.be.a("string");
  return loginAs(`credit-${key}`, email, Cypress.env("qaCreditPassword"));
});

/** Returns the current Supabase session's access_token (must be called after visiting the app while logged in). */
Cypress.Commands.add("getSupabaseAccessToken", () => {
  return cy
    .window()
    .its("localStorage")
    .invoke("getItem", AUTH_STORAGE_KEY)
    .then((raw) => {
      expect(raw, "supabase auth-token present in localStorage").to.be.a("string");
      const parsed = JSON.parse(raw);
      const token = parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token);
      expect(token, "supabase access_token").to.be.a("string");
      return token;
    });
});

/** Decodes the current session's user id straight out of the JWT payload (no extra request). */
Cypress.Commands.add("getSupabaseUserId", () => {
  return cy.getSupabaseAccessToken().then((token) => {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub;
  });
});

// --- Supabase REST helpers (data setup + real state verification, not UI scraping) --
function supabaseRequest({ method = "GET", path, accessToken, body, failOnStatusCode = true, headers = {} }) {
  return cy.request({
    method,
    url: `${SUPABASE_URL}/rest/v1/${path}`,
    body,
    failOnStatusCode,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : undefined,
      ...headers,
    },
  });
}

Cypress.Commands.add("supabaseRequest", supabaseRequest);

/**
 * Finds a live, bookable dress via the public (anon-key) REST API — the same data the
 * /browse page reads. Prefers a dress whose enabled shipping options include "pickup",
 * which lets checkout Page Objects skip the full street-address form (only a phone
 * number is required for pickup) and stay robust to address-form layout changes.
 *
 * Also biases toward HIGHER-priced dresses (hire_price_a desc): the shared renter test
 * account accumulates account credit as more test bookings are created against it over
 * time, and a cheap dress can end up with a $0.00 total once credit fully covers it —
 * which authorise-booking doesn't handle cleanly (observed surfacing as a misleading
 * 409 "expired selection" error). A pricier dress keeps the total positive for longer.
 */
Cypress.Commands.add("findBookableDress", () => {
  return supabaseRequest({
    path:
      "dresses?select=id,title,hire_price_a,lender_id,requires_deposit,shipping_options:dress_shipping_options(shipping_type,is_enabled)" +
      "&status=eq.active&hire_price_a=gt.0&order=hire_price_a.desc&limit=20",
  }).then((res) => {
    expect(res.status, "dresses lookup status").to.eq(200);
    expect(res.body, "at least one active bookable dress exists").to.have.length.greaterThan(0);
    const dresses = res.body;
    const pickupDresses = dresses.filter((d) =>
      (d.shipping_options || []).some((s) => s.shipping_type === "pickup" && s.is_enabled !== false),
    );
    // Pick randomly among candidates (not always the same dress) so concurrent/rapid test
    // runs don't collide on the same dress's date-hold/reservation state.
    const pool = pickupDresses.length ? pickupDresses : dresses;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return { ...chosen, shippingOption: pickupDresses.length ? "pickup" : "standard" };
  });
});

/**
 * Reads a renter's TRUE current account-credit balance via the same RPC the checkout
 * page itself calls (dx_calculate_credit), using a deliberately huge nominal rental fee
 * (so the credit is never capped by the booking amount) — a read-only, side-effect-free
 * way to check a credit-test account's balance without visiting any page.
 */
Cypress.Commands.add("getRawCreditBalance", (accessToken, renterId) => {
  return cy
    .request({
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/rpc/dx_calculate_credit`,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: {
        p_renter_id: renterId,
        p_rental_fee: 999999,
        p_cleaning_fee: 0,
        p_shipping_fee: 0,
        p_two_hour_fee: 0,
        p_service_fee: 0,
        p_discount_applied: 0,
        p_has_discount_code: false,
        p_is_try_on: false,
      },
    })
    .then((res) => {
      expect(res.status, "dx_calculate_credit status").to.eq(200);
      return Number(res.body);
    });
});

/**
 * Finds an active dress by an exact or partial title match (case-insensitive) — used
 * where a test needs a SPECIFIC, named listing with a known price (e.g. the credit-at-
 * checkout test pack's fixed prices), not just any bookable dress.
 */
Cypress.Commands.add("findDressByTitle", (titleMatch) => {
  return supabaseRequest({
    path: `dresses?select=id,title,hire_price_a,lender_id,shipping_options:dress_shipping_options(shipping_type,is_enabled)&status=eq.active&title=ilike.*${encodeURIComponent(titleMatch)}*&limit=1`,
  }).then((res) => {
    expect(res.status, "dress-by-title lookup status").to.eq(200);
    expect(res.body, `an active dress matching title "${titleMatch}" exists`).to.have.length.greaterThan(0);
    return res.body[0];
  });
});

/** Counts bookings visible to the current user for a given dress (RLS-scoped, like the app itself). */
Cypress.Commands.add("countBookingsForDress", (dressId, accessToken) => {
  return supabaseRequest({ path: `bookings?select=id&dress_id=eq.${dressId}`, accessToken }).then((res) => res.body.length);
});

/** Fetches a booking row by id using the renter's own access token (subject to RLS, like the app itself). */
Cypress.Commands.add("getBookingById", (bookingId, accessToken) => {
  return supabaseRequest({
    path: `bookings?select=*&id=eq.${bookingId}`,
    accessToken,
  }).then((res) => {
    expect(res.status, "booking lookup status").to.eq(200);
    expect(res.body, `booking ${bookingId} exists and is visible to this user`).to.have.length(1);
    return res.body[0];
  });
});

/**
 * Builds the /checkout URL exactly the way dresses.$id.tsx's handleBook() does (see source).
 * The start date is randomized within a wide future window so independent tests booking the
 * same dress in the same run never collide on the same date range (test isolation).
 */
Cypress.Commands.add("buildCheckoutUrl", (dress) => {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() + 3 + Math.floor(Math.random() * 60)); // minDate is "today + 2"; +3 is safely clear of it.
  const to = new Date(from);
  to.setDate(to.getDate() + 3);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    dress_id: dress.id,
    from: fmt(from),
    to: fmt(to),
    hire_option: "a",
    shipping_option: dress.shippingOption || "standard",
  });
  return `/checkout?${params.toString()}`;
});
