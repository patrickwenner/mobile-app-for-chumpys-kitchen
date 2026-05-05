# LunchBox

School lunch ordering app for Chumpy's Kitchen. Three roles (Super Admin, School Admin, Parent), Supabase backend, Resend for email notifications, deployed on Vercel.

## Stack

- **Frontend:** React + Vite, single-file app (`src/lunch-app.jsx`) with `AppContext` providing data and actions
- **Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Email:** Resend, called from a Supabase Edge Function whenever the menu changes

## Project layout

```
.
├── index.html
├── package.json
├── vite.config.js
├── .env                 ← local secrets, NOT in git
├── .env.example
├── src/
│   ├── main.jsx                    ← entry; wraps App in <AppProvider>
│   ├── lunch-app.jsx               ← all UI (login + 3 role dashboards)
│   ├── lib/supabase.js             ← Supabase client + raw API helpers
│   └── context/AppContext.jsx      ← data + actions; the only thing UI imports
└── supabase/
    ├── schema.sql                  ← reference of the deployed schema
    └── functions/notify-menu-change/index.ts
```

## Architecture cheat-sheet

- Components **never** import from `lib/supabase.js` directly — they call `useApp().actions.<x>()`.
- `AppContext` is the boundary: it normalizes Supabase rows from snake_case → camelCase (`order_date` → `date`, `dietary_selected` → `dietary.selected`, etc.) and re-fetches after mutations.
- Realtime: `AppContext` subscribes to `postgres_changes` on `orders`, `menu_days`, `menu_items`, and `blocked_days`. Any change anywhere triggers a refresh.
- The 8AM cutoff is enforced in **two places**: the UI hides controls past 8AM, and the database trigger rejects writes (so a parent fiddling with the client can't bypass it).

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
```

Requires `.env` populated with the two `VITE_SUPABASE_*` values from `.env.example`.

## Deploying

### 1. Deploy the Edge Function (once)

```bash
# From the project root, with the Supabase CLI logged in and linked:
supabase functions deploy notify-menu-change --project-ref veymtnpmtqainnfqdhsy
```

These secrets must be set on the Supabase project (already done — listed for reference):

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set FROM_EMAIL=info@chumpyskitchen.com
supabase secrets set APP_URL=https://lunchbox.vercel.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the Supabase runtime — don't set them manually.

### 2. Verify the Resend domain

Log into your DNS registrar for `chumpyskitchen.com` and add the records Resend's dashboard shows. Until verification passes, emails won't deliver.

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial LunchBox app"
gh repo create lunchbox --private --push --source=.
```

### 4. Connect Vercel

1. Go to https://vercel.com/new and import the GitHub repo.
2. Framework preset: **Vite**. Build command and output dir auto-detect.
3. Add Environment Variables (Production, Preview, Development):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Future pushes to `main` redeploy automatically.

## Manual one-time setup (not scriptable)

These can't be done via the Supabase CLI / API and need to be clicked through:

- **Enable leaked password protection.** Supabase Dashboard → Authentication → Policies → toggle "Leaked password protection" on. Catches passwords known to be in HaveIBeenPwned dumps.
- **Verify the Resend domain.** Add the DNS records Resend shows for `chumpyskitchen.com` to your registrar; click Verify in the Resend dashboard. Until verified, emails won't deliver.
- **Rotate any leaked Resend keys** (see "Rotating a leaked Resend key" below).

## Operational notes

### Creating an admin user

There's no public UI to create a Super Admin or School Admin. Do it manually:

1. Create the auth user in **Supabase Dashboard → Authentication → Users → Add user** (set a password).
2. The `handle_new_user` trigger will insert a row into `profiles` with `role = 'parent'`. Update it:

```sql
UPDATE public.profiles
SET role = 'superadmin', name = 'Patrick'
WHERE id = (SELECT id FROM auth.users WHERE email = 'YOU@example.com');
```

For a School Admin, also set `location`:

```sql
UPDATE public.profiles
SET role = 'schooladmin', name = 'ESN Admin', location = 'Episcopal School Of Nashville'
WHERE id = (SELECT id FROM auth.users WHERE email = 'esn.admin@lunchbox.app');
```

### Adding a location

Use the Super Admin → Locations page in the app. Behind the scenes this writes to `public.locations`. The seed in `supabase/schema.sql` only runs on a fresh install.

### Rotating a leaked Resend key

```bash
# 1. Revoke in Resend dashboard, generate a new one.
# 2. Update the Supabase secret:
supabase secrets set RESEND_API_KEY=re_NEW_KEY --project-ref veymtnpmtqainnfqdhsy
# 3. No redeploy of the function is needed — secrets refresh on next invocation.
```

## Testing checklist

After deployment, walk through this end-to-end:

- [ ] Super admin can sign in
- [ ] Super admin can add / rename / delete a location
- [ ] Super admin can edit a menu day → email arrives to a test parent account
- [ ] Super admin can block a day → shows red in parent calendar
- [ ] School admin can sign in and see today's orders for their location only
- [ ] School admin can print today's order sheet
- [ ] Parent can register a new account
- [ ] Parent can add a child with dietary restrictions
- [ ] Parent sees blocked days greyed out
- [ ] Parent can place an order (food → drink → repeat prompt)
- [ ] Parent **cannot** place an order after 8AM (try editing the request to confirm DB rejects it too)
- [ ] Parent can edit / cancel an upcoming order before 8AM
- [ ] New order appears on school admin view in real time (no refresh)
- [ ] Monthly reports show correct totals

## Troubleshooting

**"Order cutoff has passed for this date"** — the DB trigger is rejecting the insert. Check the user's local clock; the cutoff uses server-side `now()` against `order_date::timestamptz + interval '8 hours'`.

**Realtime updates aren't arriving** — the channels in `AppContext.jsx` need Supabase
<!-- Build trigger: 20260505T125228Z -->