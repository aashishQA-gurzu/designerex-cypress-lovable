# DX PREVIEW

Project: Building the public website for Designerex, an Australian peer-to-peer designer dress rental marketplace. This is the renter and lender-facing site (NOT the admin dashboard — that's a separate Lovable project that already exists).
Backend: Connect to the existing Designerex Supabase project. The backend has 47 tables already built with RLS policies — this frontend just authenticates and queries. No backend changes needed from this side.
Test accounts (already in Supabase):

admin@designerex.com.au / TestAdmin123!
lender@designerex.com.au / TestLender123!
renter@designerex.com.au / TestRenter123!

Visual direction: Clean, editorial, fashion-focused. Think TENN, Djerf Avenue, modern Australian fashion brands. Professional but warm. Reference the design language from these guidelines:

Black header bar with white text and small pink accent (#FF4D8F or similar warm pink)
Serif typography for headings (something like Playfair Display or Cormorant Garamond), clean sans-serif for body (Inter or similar)
Soft cream/off-white backgrounds for content areas (#FAF7F2 or similar)
Pink accent for CTAs, hearts, important highlights
Lots of whitespace, large product imagery the hero of every page
Subtle hover states, smooth transitions
Desktop-first responsive (laptop is the primary use case, mobile must work but isn't the priority)

What this prompt builds
Just the foundation:

App shell (header + footer that wraps every page)
Auth flows (signup, login, password reset)
Signup discount surfacing
Empty route placeholders for the pages we'll build later

Do NOT build homepage content, browse page, product page, etc. yet. Those come in later steps.
Header (logged-out)
Black bar across the top, fixed/sticky on scroll (minimises slightly on scroll for cleaner reading):

Left: "DX DESIGNEREX" logo (clickable, returns to homepage)
Centre nav links: NEW IN, WHAT'S POPULAR, DESIGNERS, OCCASIONS, HOW IT WORKS (each links to a placeholder route)
Right side: Search bar (rounded white input with magnifying glass icon, placeholder "Search for dresses, designers, occasions..."), then a row of icons: heart (saved items), bag (cart/bookings), chat bubble (messages), bell (notifications), profile circle with chevron
Clicking any of the right-side icons when logged out → opens the login modal

Header (logged-in)
Same layout but:

Profile circle shows the user's avatar (from profiles.avatar_url, fallback to initials on a coloured circle)
Bell shows a pink dot/count badge if notifications table has unread rows for this user (read_at is null)
Chat icon shows a count if any conversations have new messages (compare messages.created_at vs conversation_participants.last_read_at)
Heart icon clickable → goes to /saved
Profile dropdown on click: "Welcome back, [first_name] 👋", links to Dashboard, Switch to Lender (only if is_lender = false), Settings, Sign out

Footer (all pages)
Cream/off-white background, organised into columns:

AS SEEN IN — placeholder logos (7NEWS, RAGTRADER, news.com.au, The Daily Telegraph, ELLE, VOGUE, marie claire) as greyscale text/SVGs. Use plain text logos for now, Daisy will provide proper logo files later.
TOP SEARCHES column: Wedding Guest Dresses, Formal Dresses, Cocktail Dresses, Black Dresses, Designer Dresses (each links to a placeholder browse filter URL)
TERMS & POLICIES: Terms & Conditions, Privacy Policy, Refund Policy, Delivery & Returns, Lender Terms (placeholder routes)
HELP & SUPPORT: FAQs, Customer Service, Contact Us, How It Works, Lending With Us (placeholder routes)
CONTACT US: hello@designerex.com.au, 1300 123 456, Mon-Fri 9am-5pm AEST
FOLLOW US: Instagram, Facebook, TikTok, Pinterest icons (lucide-react icons, link to placeholder URLs)

Sign-up flow
Modal or dedicated /signup page. Fields:

Email *
Password * (min 8 chars, mix of letters/numbers/symbols, with show/hide toggle)
Confirm Password *
First Name *
Last Name *
Date of Birth * (3 dropdowns: day/month/year, validates user is 18+)
Mobile Number (optional at signup, can be added later)
Checkbox: "I want to lend dresses too" (sets is_lender = true on the profile if checked)
Checkbox: "I agree to the Terms & Conditions and Privacy Policy" *
"Create Account" button

Important: the signup must allow .com.au email domains. Override any browser-native email validation that blocks them (we hit this with the admin dashboard already — same fix needed here).
On submit:

Call Supabase Auth signUp({ email, password })
The existing handle_new_user trigger creates the profile row
The existing profiles_generate_signup_discount trigger creates a discount_codes row with code = "WELCOME" + uppercased first 8 chars of profile id, discount_percent = 10, valid for 72 hours, max_uses = 1
The existing trigger also creates a notification of type 'signup_discount' with the code in the body
Update the profile row with first_name, last_name, date_of_birth, is_lender from the form
Show the welcome modal (see below)
Redirect to homepage

Welcome modal (post-signup)
Big modal that pops up immediately after successful signup:

Headline: "Welcome to Designerex! 🎉"
Subhead: "Here's 10% off your first booking"
The actual discount code displayed large and copyable (e.g., "WELCOME8DA6B063")
"Copy code" button
Subtle note: "Valid for 72 hours — apply at checkout"
"Start Browsing" button → closes modal, stays on homepage

Modal should be elegant, on-brand. Pink accent for the code background.
Login flow
Modal or dedicated /login page. Email + password fields. Same .com.au email allowance fix.
On submit:

Call Supabase Auth signInWithPassword
On success: fetch the profile row, store in app state, close modal/redirect to previous page
On failure: friendly error message

"Forgot password?" link → opens password reset flow
Password reset flow
/forgot-password page:

Single email input
"Send reset link" button
Calls Supabase Auth resetPasswordForEmail
Success state: "Check your email for a reset link"

/reset-password page (accessed via email link):

New password + confirm password fields
Calls Supabase Auth updateUser({ password })
Success redirects to login

Route structure (build placeholders only)
Create empty/skeleton pages for these routes. Each shows the app shell (header + footer) with just a centered "Coming soon" message in the body for now:
Public:

/ — homepage
/browse — browse all dresses
/dresses/:id — product detail
/designers — designer list
/designers/:slug — designer page
/occasions/:slug — occasion page
/edits/:slug — curated edit page
/cities/:slug — city page
/how-it-works — how it works

Auth-required:

/dashboard — user dashboard (overview)
/dashboard/profile — profile details
/dashboard/addresses — saved addresses
/dashboard/payment — payment details
/dashboard/id-verification — ID verification
/dashboard/password — change password
/dashboard/bookings — bookings list
/dashboard/booking-requests — booking requests (lender)
/dashboard/listings — dress listings (lender)
/dashboard/availability — availability calendar (lender)
/dashboard/shipping — shipping settings (lender)
/dashboard/two-hour-delivery — Uber delivery toggle (lender)
/dashboard/promo — promo settings (lender)
/dashboard/vacation — vacation mode (lender)
/messages — inbox
/messages/:conversation_id — specific conversation thread
/saved — saved/wishlist dresses
/checkout — checkout flow
/checkout/confirmed — booking request confirmed page

Auth guards

Any /dashboard/*, /messages*, /saved, /checkout* route requires login. Unauthenticated user → redirect to login modal with intent to return to original URL after login.
Lender-only routes (/dashboard/listings, /dashboard/availability, /dashboard/shipping, /dashboard/two-hour-delivery, /dashboard/promo, /dashboard/vacation, /dashboard/booking-requests) require is_lender = true. If user has is_lender = false, show a "Become a lender" prompt with a toggle to enable lending.

"Become a Lender" prompt
If a user lands on a lender-only route and is_lender = false:

Show a clean page (within the app shell) with:

Headline: "Want to lend your dresses?"
Body text about earning extra income, sharing your wardrobe, etc.
Big toggle button: "Yes, enable lending"
On click: UPDATE profiles.is_lender = true for the current user, then refresh the page so the actual lender feature loads



State management
Use React Context for the auth/profile state — provide the current user's profile object app-wide. Hooks like useAuth() and useProfile() for clean access.
Refresh profile data when:

User logs in
User updates their profile
The is_lender toggle flips

Test before completing

Sign up a new test account with a .com.au email — verify the welcome modal appears with a real discount code from the database (not a hardcoded value)
Sign out, sign in with renter@designerex.com.au / TestRenter123! — verify the header switches to logged-in mode
Click into /dashboard/listings — verify the "Become a Lender" prompt appears (renter is not a lender)
Click "Yes, enable lending" — verify profile updates and the page reloads as if you're a lender
Sign out, sign in with lender@designerex.com.au — verify direct access to lender routes works
Sign out, sign in with admin@designerex.com.au — verify regular site access works (admin uses the separate admin dashboard for admin work, not this site)
Test forgot password flow with a real email — verify reset email arrives

Don't build any actual page content yet. Just the shell and the auth flows. Report back when complete with any blockers.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://designerex-unlocked.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a234c2c6-94d2-4512-bfe9-f738566019dc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
