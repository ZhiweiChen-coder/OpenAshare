# OpenAshare Supabase setup

The first integration phase stores user-owned workspace data in Supabase while
keeping the current SQLite/localStorage path as the development fallback.

## 1. Apply the database migration

In the Supabase Dashboard SQL Editor, run:

```text
supabase/migrations/0001_openashare_workspace.sql
```

The migration creates the workspace tables, foreign keys, indexes, updated-at
triggers, and Row Level Security policies. Every user-owned table has a
`user_id` that references `auth.users(id)`.

After running it, confirm in Supabase Dashboard → Table Editor that these
tables exist:

```text
user_settings, watchlists, watchlist_items, agent_sessions,
agent_messages, pinned_contexts, portfolio_positions, strategy_holdings
```

## 2. Configure the backend locally

Add these values to the untracked root `.env` file or your deployment secret
store. Do not commit them and do not expose the secret/service role key to the
browser:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
# Legacy projects may use this name instead:
# SUPABASE_ANON_KEY=<legacy-anon-key>
SUPABASE_REQUIRE_AUTH=true
```

The frontend `.env.local` can keep the `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pair supplied by Supabase. Local API
development also accepts those names as a fallback, but deployments should
prefer the server-only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` names.

For the current authenticated workspace flow, the publishable key is enough:
the user's JWT is sent with each request and RLS limits access to that user.
An elevated Secret key is optional and should only be added for trusted
background jobs or administrative operations that intentionally bypass RLS:

```env
# Optional; server-only, never NEXT_PUBLIC_* and never browser code.
SUPABASE_SECRET_KEY=<sb_secret_...>
# Legacy equivalent: SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
```

The current backend reads the user's Supabase access token from the
`Authorization: Bearer ...` header and validates it through Supabase Auth. The
workspace API then uses the same token for PostgREST, so RLS remains active.

## 3. Verify the integration

Without Supabase variables, this endpoint intentionally reports local mode:

```text
GET /api/workspace/bootstrap
```

With Supabase enabled, the request must include a logged-in user's bearer token
and returns that user's settings, watchlists, sessions, and pinned contexts.

From the Workspace UI:

1. Open `http://127.0.0.1:3001/work`.
2. Click `连接 Supabase` and sign up or sign in with an account created in the
   Supabase Auth dashboard.
3. Confirm the header changes to `云端已连接`.
4. If the migration has not been applied, the header will show `云端异常` and
   the browser console/API response will report the missing table.

## 4. Enable Google login

The Workspace login panel now includes Google OAuth. In Supabase Dashboard:

1. Open Authentication → Providers → Google and enable the provider.
2. Create a Google OAuth Web client in Google Cloud Console.
3. Add Supabase's callback URL to Google as an authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Add these application callback URLs to Supabase Authentication → URL
   Configuration → Redirect URLs:
   `http://127.0.0.1:3001/auth/callback` and your production HTTPS callback.

The app exchanges the OAuth code in
`app/auth/callback/route.ts`, so the session is stored in the SSR cookie and
the same RLS-protected workspace bootstrap is used after Google login.

## Current boundary

Supabase Auth and the authenticated bootstrap read are now wired into the
Workspace. Existing localStorage remains as a safe fallback for anonymous local
development. Watchlist/session CRUD migration is the next phase; the current
connection validates identity, RLS access, and cloud bootstrap before replacing
the remaining local writes.
