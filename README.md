This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Marketing metrics

The staff dashboard section is at `/dashboard/marketing`.

1. Apply `supabase/erp_core_schema.sql` if the ERP is not installed yet.
2. Run `supabase/marketing_metrics_schema.sql` in the Supabase SQL editor.
3. Open **Marketing metrics** in the sidebar. Admin, branch manager, and sales
   manager roles have access by default; change view/manage access in Settings.

Use **Centres & platforms** to add or rename competitors and social platforms,
and choose each centre's chart color. Instagram, YouTube, and Telegram are supplied
as starter platforms. No competitor counts are prefilled.

When adding or editing a platform, upload a PNG, JPG, or WebP logo (up to 2 MB).
The form previews the logo and lets you replace or remove it before saving. Logos
appear before platform names in all three charts and their JPG exports. Uploaded
images are resized to fit 256 × 256 pixels and saved as embedded PNGs. Rerun
`supabase/marketing_metrics_schema.sql` to add logo support to an existing setup.

Click a platform name in the monthly table to add that centre's social profile
link. Saved names open the profile in a new tab; the pencil button edits the URL.
Links are shared across months. Managing links requires Marketing manage access;
view-only staff can open existing links. If the schema was applied before profile
links were added, rerun `supabase/marketing_metrics_schema.sql` to create the new
table without changing existing counts.

The monthly sheet has a row for every centre/platform pair and a column for every
day. Paste tab-separated numeric cells from a spreadsheet (without headers), or
enter counts manually. Commas and grouped spaces are accepted. A blank is missing
data; an explicit zero is a real observation. Clearing a saved cell removes that
observation when you save. **Save changes** saves all pending cells across months
atomically (up to 5,000 cells); unsaved edits stay in this page until saved or left.

**Charts & insights** provides a daily audience bar chart, a monthly line chart,
and a growth leaderboard for the selected platform. Lines have gaps for missing
days; growth compares each centre's first and last recorded dates, with those dates
shown. Percentage growth is unavailable for a zero baseline. Charts preview valid
unsaved entries, and each exports a standalone JPG at 2× resolution.

Marketing data is shared across the staff workspace. Direct anonymous and
authenticated database access is denied; server routes check ERP permissions and
write using the service role. The database save function is service-role-only.

## Private finance portal

The unlinked personal finance workspace lives at `/x97-private-portal`. Its URL and
`noindex` metadata are only privacy layers; API access is restricted to one Supabase
user ID.

1. Run `supabase/private_finance_schema.sql` in the Supabase SQL editor.
2. Add `PRIVATE_FINANCE_USER_ID=<supabase-auth-user-uuid>` to the local and deployed
   environment variables.
3. Sign in at the hidden URL using that user's Google account.

The USD/UZS display rate comes from the official Central Bank of Uzbekistan API.
USD transactions keep the rate used when they were recorded, so historical totals
do not change when today's rate changes.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
