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

## Statistics

The daily statistics workspace lives at `/dashboard/statistics` and appears as
**Statistics** in the staff sidebar.

1. Apply `supabase/erp_core_schema.sql` first if the ERP is not installed.
2. Run `supabase/statistics_schema.sql` in the Supabase SQL editor.
3. Refresh the dashboard. Admin, branch manager, and sales manager roles have
   view/manage access by default; configure other roles in Settings.

To import the supplied September 2026 screenshots, run
`supabase/statistics_import_september_2026.sql` after the Statistics schema. It
creates 20 categories and imports 312 observations for September 2–18. Blank
cells remain unrecorded. Existing categories and figures are preserved on reruns;
the final result reports how many observations were inserted or already present.

Use **Categories** to add or edit a name, chart color, and unit (numbers, UZS,
USD, or percent). Each category is a column and every day of the selected month
is a row. Enter figures manually or paste a rectangular numeric range from a
spreadsheet without its headers or date column. Grouped thousands, negative
numbers, and up to two decimal places are supported. Blank means unrecorded;
zero is a real observation. Clearing a cell removes it on save.

To delete a category, select it under **Categories**, click **Delete category**,
and confirm. This permanently removes its observations across all months and its
unsaved entries; other categories are unaffected. Rerun `statistics_schema.sql`
to install the atomic deletion function on an existing database.

**Save changes** saves pending entries across months in one transaction (up to
5,000 cells), preserving edits after a failed request and warning before leaving
with unsaved entries. Chart previews include valid unsaved figures.

**Charts & insights** reuses the Marketing chart renderer and JPG exporter. Choose
a unit and select categories for a daily change bar chart, monthly line chart,
and first-to-last change bar chart. Missing days stay as gaps, change charts show
their actual observed date ranges, and percentages are unavailable for zero or
negative baselines. Categories with different units are charted separately.
Monthly trends fit the value axis to the lowest and highest recorded figures of
the selected categories, ignoring missing days; constant series get a small range
around their value. Daily change subtracts the previous calendar day, including
the last day of the preceding month. Both dates need figures; missing data stays
missing, while increases, decreases, and unchanged values are shown explicitly.
Figures are not summed across days because balances and cumulative counts can be
snapshots. Each chart exports as a standalone JPG at 2× resolution.

Statistics is shared across the staff workspace. The API checks Statistics
permissions; direct anonymous/authenticated database access is denied. Only the
server service role can execute the atomic save function.

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
appear before platform names in all platform charts and their JPG exports. Uploaded
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

**Charts & insights** provides a total daily audience bar chart across all platforms,
a daily audience bar chart and a daily change bar chart for the selected platform,
a monthly line chart,
and a growth leaderboard for the selected platform. Lines have gaps for missing
days; growth compares each centre's first and last recorded dates, with those dates
shown. Percentage growth is unavailable for a zero baseline. Charts preview valid
unsaved entries, and each exports a standalone JPG at 2× resolution.

In Marketing **Charts & insights**, use the learning-centre checkboxes to include
or exclude centres from all five charts and their JPG exports. The selection
persists across dates, months, platforms, and table/chart tabs while the page stays
open. Unchecking every centre shows a prompt to select at least one.

Daily audience change subtracts the previous calendar day for each centre on the
selected platform, including across month/year boundaries. Both dates must have
recorded counts; missing values are not treated as zero.

Total daily audience sums each centre's recorded counts on the selected date and
ranks centres by that sum, regardless of the platform filter. Platform coverage
and partial totals are labeled in the chart and its export; missing observations
are not treated as zero. These are combined subscriptions, so a person following
a centre on multiple platforms may be counted more than once.

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
