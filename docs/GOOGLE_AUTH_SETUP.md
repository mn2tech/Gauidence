# Google Sign-In Setup (Supabase Auth)

This guide covers everything needed to make "Continue with Google" work in
local development and on the Vercel production deployment
(`https://guardian-app-delta.vercel.app`).

> **Status: configured and working** (July 11, 2026).
> Supabase project: `guardian` (ref `xnvmbbxqvuqiysdkwhbh`), Google OAuth
> client: `Guardian Web` in the `nm2bibleai` Google Cloud project. The steps
> below document how it was set up and how to reproduce it.

## 1. Google Cloud OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create
   (or select) a project.
2. Open **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Fill in app name ("Guardian"), support email, and developer contact.
   - Scopes: the defaults (`email`, `profile`, `openid`) are all that is needed.
3. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://guardian-app-delta.vercel.app`
   - **Authorized redirect URIs:**
     - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
       (find your project ref in Supabase → Project Settings → API; this is the
       only redirect URI Google needs, because Google always redirects to
       Supabase, and Supabase then redirects back to the app)
4. Save the generated **Client ID** and **Client Secret**.

## 2. Supabase configuration

### Enable the Google provider

Supabase Dashboard → **Authentication → Providers → Google**:

- Toggle **Enable Sign in with Google** on.
- Paste the Google **Client ID** and **Client Secret** from step 1.
- Save.

### Site URL and redirect URLs

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://guardian-app-delta.vercel.app`
- **Additional Redirect URLs:**
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3001/auth/callback` (used when port 3000 is taken)
  - `https://guardian-app-delta.vercel.app/auth/callback`

If you later add a custom domain, add `https://yourdomain.com/auth/callback`
here too and update the Google authorized origins.

### Database migration

Run `supabase/migrations/0001_profiles.sql` in the Supabase **SQL Editor**.
It creates the `profiles` table with Row Level Security and a trigger that
auto-creates a profile row on signup (capturing Google's full name and avatar
when available) without ever overwriting later user edits.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

For production, add the same two variables in Vercel:
**Project → Settings → Environment Variables** (or via CLI):

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel --prod
```

The Google client secret lives only in the Supabase Dashboard — it is never
stored in this repo or in Vercel.

## 4. How the flow works

1. User clicks **Continue with Google** on `/login` or `/signup`.
2. The app calls `supabase.auth.signInWithOAuth({ provider: "google" })`,
   which sends the user to Google's consent screen.
3. Google redirects to Supabase (`/auth/v1/callback`), which redirects back to
   the app at `/auth/callback?code=...`.
4. The app exchanges the code for a session, ensures a `profiles` row exists
   (duplicate-safe), and redirects to `/dashboard`.
5. Canceled logins, provider errors, and missing configuration all land back
   on `/login` with a clear, friendly message.

## 5. Behavior notes

- New Google users get a profile automatically (name + avatar from Google).
- Returning users reuse their existing account and profile; nothing is
  overwritten on later logins.
- Authenticated users visiting `/login` or `/signup` are redirected to
  `/dashboard`; unauthenticated visits to `/dashboard` redirect to `/login`.
- Until the env vars are set, the auth pages show a "not configured" notice
  and the rest of the site keeps working.
