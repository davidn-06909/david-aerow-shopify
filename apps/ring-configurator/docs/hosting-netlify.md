# Optional $0 hosting: Netlify Node Functions and PostgreSQL

This path is deployed at `https://aevow-ring-pilot.netlify.app`. Public runtime
and Shopify cutover checks are recorded separately in the acceptance evidence.
These configuration files alone create no account, database, paid plan, or
remote upload. The existing
local Node server remains the default. Render requested a card on the current
account, so its free-service blueprint is not an available no-card deployment
for this user.

As checked on 31 October 2026, Netlify's Free plan includes 300 monthly credits,
a hard usage limit and no automatic recharge. Netlify also documents no-card
Free signup. An account can still request an identity check; if it requires a
payment method, do not activate it under this pilot's $0 constraint. Exhausting
the allowance can pause the app. These limits suit pilot review, not a promise
of uninterrupted production service. See the current [Free plan terms](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
and [no-card announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/).

## Deployment preparation

1. Choose the **Free** plan. Connect the feature branch only after source export
   is authorized. Set the Netlify base directory to `apps/ring-configurator`.
   Its `netlify.toml` publishes `build/client` and builds the official React
   Router adapter into Node Functions. It enables neither Edge Functions nor a
   static SPA fallback. The [official React Router guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/react-router/)
   describes this deployment target.
2. Create one empty PostgreSQL database using either of these free options.
   Netlify Database is listed on the current credit-based Free plan; manually
   provision it in the dashboard and copy its PostgreSQL connection string.
   Netlify documents support for existing ORMs through a raw connection string,
   so this app keeps Prisma. No database SDK or automatic provisioning is added.
   See [Netlify database tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/).
   Alternatively, Neon Free explicitly requires no card or time limit and
   currently includes 1 GB/project and 100 CU-hours/month/project. See
   [Neon pricing](https://neon.com/pricing).
3. Store secrets in the site's environment settings for the production build
   and Functions. Free-plan secret protection is enabled with `is_secret=true`,
   production context, and the standard `builds`, `functions`, `runtime` scopes;
   post-processing is excluded. Narrower scope customization requires a paid
   plan, which this pilot does not activate. Use the pooled connection as `DATABASE_URL`; for Neon, retain
   `sslmode=require` and consider `connection_limit=1&connect_timeout=15` for the
   small serverless pilot. Keep a direct connection locally as
   `DATABASE_URL_UNPOOLED` for schema migrations. The app's `db:migrate` wrapper
   uses that URL when supplied and otherwise preserves local `DATABASE_URL`
   behavior. See [Neon's Prisma connection guidance](https://neon.com/docs/guides/prisma).
4. Supply `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, the existing
   `CONFIGURATION_SIGNING_SECRET`, `PILOT_ALLOWED_SHOP`, and `PILOT_MANIFEST_JSON`
   (the mapped local manifest, including its US fulfillment location). Set
   `CLIENT_CREDENTIALS_AUTH=true`, `PREVIEW_STORAGE=database`, and initially
   `ENABLE_PURCHASES=false`. Leave `ASSET_BASE_URL` blank. No R2 credentials or
   payment method are needed. Do not put `.env`, database dumps, or access tokens
   into the repository or public build directory.
5. Deploy the committed schema to the approved empty destination with
   `npm run db:migrate` using its direct URL. This is a separate operator step:
   deploy previews and normal frontend builds do not run schema mutations
   automatically. Import the existing pilot records before enabling purchases
   if the original shared designs/order evidence must remain available.
6. Let Netlify run the configured build. Node 22 is selected for build and,
   by default, Functions runtime. Prisma's generator includes the native engine
   and `rhel-openssl-3.0.x`, required by the Node 20+ Lambda runtime. The function
   configuration includes generated Prisma files and versioned model files.
   See [Prisma's Netlify deployment guidance](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/serverless/deploy-to-netlify).
7. Set Shopify's actual application URL and callback to the Netlify HTTPS
   domain and release that app configuration. Check `/health`, embedded admin
   diagnostics, cross-origin GLB loading, saving/restoring a real ring preview,
   the cart, and a new signed Shopify webhook. Enable purchases only after these
   checks. The theme app extension still needs its own Shopify release; a
   Netlify build does not publish a Shopify theme.

The adapter creates `.netlify/v1/functions/react-router-server.mjs` with its
documented routing configuration. `build:netlify` replaces the adapter's default
full-URL logger with a small React Router Node handler, so embedded Shopify
`id_token` parameters are not copied into application logs. The replacement
fails the build if the expected generated format changes.

## Runtime and verification limits

The generated Node handler has been exercised locally against `/health`, a v2
GLB, a retained v1 GLB, and an actual JPEG stored in PostgreSQL; all returned
200 with the expected binary data. The opt-in build succeeds. The deployed
12 MB package contains the Linux x64 RHEL query engine and all four historical
and current model files; its audit found no environment files, private
configuration, backups, or secret literals. Actual hosted database/image and
Shopify integration checks are recorded separately; local smoke checks alone
do not prove those external integrations.

Netlify documents a 60-second synchronous execution limit and a 6 MB buffered
payload limit. This app's 800 KB JSON request limit and 500 KB image limit fit
within it. Shopify request deadlines, database wake-up time, webhook retries and
cold starts still need measurement on the actual deployment. See
[Function configuration and limits](https://docs.netlify.com/build/functions/configuration/).
Use separate database credentials and disabled purchasing for preview deploys.

## Moving this workspace's existing records

The approved selective transfer uses `scripts/transfer-pilot-records.ts` after
the committed Prisma migrations create empty target tables. Netlify explicitly
supports an [independent migration system](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/#manual-migrations);
the existing `prisma/migrations` directory avoids automatic native-migration
detection. Do not duplicate those migrations under Netlify's native directory.

Supply source `DATABASE_URL` and destination `PILOT_EXPORT_DATABASE_URL` in the
process environment. The script is read-only by default; applying requires
`--apply` and `PILOT_DATABASE_EXPORT_APPROVED=true`. It refuses a populated
target and never deletes or updates source data. It copies Quotes, Designs
(including image bytes), WebhookReceipts and OrderDesign associations with
their exact IDs, references, dates and values. Session records and Shopify
access tokens are excluded. The cloud app obtains a fresh grant independently.

Before writing, the script saves an ignored, binary-preserving JSON backup.
The transaction verifies record and image hashes before committing and again
afterward. The approved transfer copied six quotes/designs, one webhook receipt
and one verified test-order association; all hashes matched, and the cloud
Session table remained empty. The original local database is retained as the
rollback source. No backup belongs in `public/` or a deployment artifact.

Preserve the signing secret so existing order references remain verifiable.
The saved-design API resolves database preview images through the current app
hostname after the move. Original snapshot and cart/order properties remain
unchanged; an old order-line image URL can still reference the former temporary
tunnel. The selective transfer and hosted model/database image reads have been
verified. Shopify callback/proxy cutover and a new hosted checkout remain
separate checks before enabling customer purchasing.
