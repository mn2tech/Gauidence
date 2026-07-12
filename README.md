# Guardian — Landing Page

Marketing landing page for **Guardian**, a private vault for the documents you cannot afford to lose. Includes a security-focused landing section and a plain-language [Security Principles](https://guardian-app-delta.vercel.app/security) page.

**Live site:** https://guardian-app-delta.vercel.app

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Lucide icons

## Pages

- `/` — landing page with hero, features, and the "Built for the information you cannot afford to lose" security section
- `/security` — Security Principles: what data is collected, how auth and access separation work, where files are stored, how AI processing works, what is not yet implemented, deletion, and how to report a concern
- `/login` and `/signup` — email/password plus "Continue with Google" via Supabase Auth
- `/dashboard` — protected document vault: upload, view in-browser, download, search, category filters, sorting, rename, AI analysis with source-labeled facts (including an AI-suggested category that never overrides a manual choice; limited to 10 analyses per user per hour), deadline alerts, and safe deletion
- `/settings` — edit profile name, change/set password, toggle email deadline reminders, and permanently delete your account with all data (requires `SUPABASE_SERVICE_ROLE_KEY`, server-side only)
- `/auth/callback` — OAuth and email-confirmation callback

## Authentication

Auth is powered by Supabase (email/password + Google OAuth). Setup guide:
[docs/GOOGLE_AUTH_SETUP.md](docs/GOOGLE_AUTH_SETUP.md). Copy `.env.example`
to `.env.local` and fill in the Supabase URL and anon key; run the SQL files
in `supabase/migrations/` (in order) in the Supabase SQL Editor. Until the
env vars are configured, auth pages show a friendly notice and the rest of the
site works normally.

## AI analysis

Document analysis uses Anthropic Claude (server-side via `ANTHROPIC_API_KEY`;
the key is never exposed to the browser). Facts are labeled by source — from the
document, calculated, or AI-generated — and future deadline dates become
dismissible alerts on the dashboard. Without the key configured, the Analyze
button returns a friendly "not set up yet" message.

Each signed-in user can run up to **10 analyses per hour**. Further requests
return a clear "try again later" message so Claude usage stays bounded.

## Error monitoring

Optional [Sentry](https://sentry.io) reporting via `NEXT_PUBLIC_SENTRY_DSN`.
When the DSN is unset, the app runs normally and does not send events. Create
a free Sentry project, copy the DSN into `.env.local` and Vercel, then redeploy.

## Email deadline reminders

A daily Vercel Cron job (`vercel.json`, schedule `0 12 * * *` UTC) calls
`/api/cron/reminders`, which emails each user their upcoming deadlines via
[Resend](https://resend.com): once when a deadline is within 7 days, and again
the day before (or day of). Dismissed alerts are never emailed, and users can
turn reminders off in Settings.

Setup:

1. Create a free Resend account and API key; set `RESEND_API_KEY`.
2. Set `CRON_SECRET` to a long random string (the route rejects requests
   without `Authorization: Bearer <CRON_SECRET>`; Vercel Cron adds it
   automatically when the env var exists).
3. Run `supabase/migrations/0004_reminders.sql`.
4. Optional: verify a domain in Resend and set `REMINDER_FROM_EMAIL`. Without
   it, emails send from `onboarding@resend.dev` and Resend only delivers to
   the account owner's own email (fine for testing).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

The project is linked to Vercel (`guardian-app`). Deploy to production with:

```bash
vercel --prod
```

## Content policy

Security copy avoids unverified claims (no end-to-end encryption, HIPAA, SOC 2, "bank-level security", or breach guarantees). Only accurate wording is used: encrypted in transit, protected by authenticated access, user-level access controls. Update `/security` if the underlying implementation changes.
