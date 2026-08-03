# Money OS

Household finance, one place. A plan-and-confirm forward ledger, net worth,
debt payoff, and budgeting — built on Next.js, Supabase, and Vercel.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Supabase** — Postgres, Auth (magic link), Row-Level Security
- **Vercel** — hosting

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in from Supabase project settings > API
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on `/login`.

## Database

Schema lives in `supabase/migrations/`. To apply it to a Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Every table is scoped by household via Row-Level Security — see the
migration file's comments for the reasoning (particularly why debts are
modeled as liability accounts rather than a separate table, and why
`transactions` has a single `status: planned | actual` column instead of
two separate tables).

## Deploying

Connect this repo to Vercel, then set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables in the Vercel
project settings (same values as `.env.local`). Push to `main` to deploy.
