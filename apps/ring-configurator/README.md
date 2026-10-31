# Aevow ring configurator

**Milestone 3 is implemented locally; hosted verification is pending.** The builder and merchant drafts support The Lumen and The Aevow Solitaire, with separate Shopify products, compatibility rules and immutable model versions. See [Milestone 3 setup, validation and pending acceptance](docs/milestone-3.md). The existing hosted release remains Milestone 2 until the deployment is verified.

**Milestone 2 is implemented on the development pilot.** Open [Manage catalog](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app/catalog) for Shopify product search, diamond eligibility, supported-option rules, draft validation/preview, publication and rollback. The customer builder has server-side filtering, sorting and pagination, tested with 200 fixture records. [Merchant instructions and Milestone 2 acceptance evidence](docs/milestone-2.md) include actual test order #1003, published-version checks and preservation of the earlier designs.

Isolated Shopify app built from Shopify's current React Router template architecture, with PostgreSQL sessions, immutable designs and preview images, server-side Shopify catalog validation, Three.js visual assets, and a theme app extension. The approved pilot requires no payment method or paid infrastructure.

**Integration status:** current account integration and acceptance evidence are recorded in `docs/acceptance.md`. The app includes a separate read-only local preview; it does not impersonate an installed integration.

The app is installed in `aerow-qdbfzxwi.myshopify.com` and hosted on Netlify Free with managed PostgreSQL. Shopify test orders **#1001 and #1002** completed at USD 5,595 each; signed webhooks verified their components, engraving and saved previews. User visual review and a measured physical-phone FPS check remain. Open the review links and recorded evidence in [the acceptance record](docs/acceptance.md).

## Local visual review

Requires Node 22.12 or later. From this directory:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run models
npm.cmd run build:storefront
$env:ENABLE_READ_ONLY_PREVIEW = 'true'
npm.cmd run dev:server
```

Open `http://localhost:3000/pilot?style=Hidden+halo&step=review&size=4.5&engraving=3ertyui&metal=Platinum&shank=High+polish&shape=Round&diamond=55882563911753`.

The preview uses the reference store's actual catalog capture in `config/reference-catalog.json`, including its capture timestamp. It is explicitly read-only. It cannot save designs, issue purchase quotes, or purchase a ring. It displays captured prices, not an assertion of current stock or prices. No Shopify credentials are needed for this visual preview.

## Install the real Shopify integration

1. Create a Shopify app for the **development store**, then run `shopify app config link` from this directory. Replace the placeholder client ID/URL in `shopify.app.toml`. Keep the Aevow reference store separate from the development purchase environment.
2. Use local PostgreSQL or a free external PostgreSQL service and copy `.env.example` to ignored `.env`. Supply Shopify key/secret, public HTTPS app URL, database URL and a random signing secret of at least 32 characters. The local Node scripts load ignored `.env` explicitly. `PREVIEW_STORAGE=database` stores bounded preview images in the same database without an R2 account or payment method.
3. Create copies of The Lumen, the four pilot diamond products and the engraving service on the development store. Publish them to Online Store and set inventory/selling policies. Confirm setting options are named Metal and Ring size (Size also supported), with the four approved metal labels. Set unique diamond inventory to one for the stock-conflict test.
4. Copy `config/pilot.example.json` to ignored `config/pilot.local.json`. Fill the development store, setting product ID, engraving variant ID and four target diamond variant IDs. Preserve each source diamond ID for old URL restoration. Verify certification and carat metadata against the source product rather than interpreting illustrative 3D proportions as measurements.
5. Leave `ASSET_BASE_URL` blank to serve the versioned GLBs through the app's public CORS-enabled resource. Database-backed preview images use `/previews/:designId`, with immutable UUID URLs. No storage subscription or payment method is required. R2 remains an optional future provider only if explicitly chosen later.
6. Run `npm.cmd run setup` to generate Prisma and deploy the committed PostgreSQL migration. Run `shopify app dev --store your-development-store.myshopify.com` and accept the installation permissions (`read_products`, `read_inventory`, `read_orders`, `write_app_proxy`). No product-writing scope is requested.
7. Open the embedded app diagnostics. Resolve every catalog mapping, signing and storage warning. Diagnostics query real Shopify prices, active publication and online sellable inventory. The app uses the development shop's base currency; configure the pilot market accordingly. Set `PILOT_ALLOWED_SHOP` to that store and `ENABLE_PURCHASES=true` only after review; quotes also require Shopify to identify it as a partner development store. A live merchant shop remains blocked by this pilot guard.
8. Deploy the app extension using `shopify app deploy`. Add its Ring configurator block to the unpublished development theme's builder page. Build/copy extension JS/CSS using the storefront build workflow. Do not point a live theme at an uninstalled or unmapped app.
9. Use the optional Netlify Node Functions deployment described below. Render requested card verification on this account, so its checked-in blueprint cannot currently satisfy this user's no-card constraint. Configure the actual HTTPS application URL/callback in Shopify and redeploy app configuration. `/health` verifies the process is serving; embedded diagnostics verify database/catalog/storage integration.
10. Complete the acceptance checklist before a live release. Deployment and Shopify extension publication are separate operations; this repository does not automatically publish a live theme.

### Optional free hosting

The Node app is deployed at `https://aevow-ring-pilot.netlify.app`; current public
runtime and Shopify cutover evidence is tracked in `docs/acceptance.md`.
Netlify's current Free plan includes 300 credits/month with a hard
limit and no automatic recharge, including Netlify Database. Keep the account
on Free and do not add a payment method. Quota exhaustion can pause the app.
See [Netlify's Free plan](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

Set the Netlify base directory to `apps/ring-configurator`; its `netlify.toml`
builds React Router into **Node Functions** and publishes `build/client`.
Manually create a Netlify database and copy its raw PostgreSQL connection
string into the app's secret `DATABASE_URL`. Existing Prisma models work with
that connection; no ORM rewrite or automatic database provisioning is added.
See [supported database drivers](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/).
Neon Free is an alternative with no card or time limit, currently 1 GB storage
and 100 CU-hours/month per project. See [Neon pricing](https://neon.com/pricing).

Supply Shopify credentials, the actual app URL, the original signing secret,
allowed development shop and `PILOT_MANIFEST_JSON`. Use
`CLIENT_CREDENTIALS_AUTH=true`, `PREVIEW_STORAGE=database`, and initially
`ENABLE_PURCHASES=false`. Apply the committed schema separately with
`npm run db:migrate`; `DATABASE_URL_UNPOOLED` can supply the direct migration
connection while `DATABASE_URL` remains pooled for runtime use. This helper
applies schema migrations only: it does **not** copy existing records. Preserve
the local database and signing secret. The reviewed
`scripts/transfer-pilot-records.ts` transfers saved designs, preview bytes,
quotes, webhook receipts and order associations into an empty destination only
after explicit approval. It saves an ignored binary-preserving backup and
verifies exact record and image hashes. **Shopify Session/access tokens are
excluded**; the cloud app obtains its own short-lived client-credentials grant.
Verify row counts and preview bytes, then recheck Shopify diagnostics, cart and
webhooks before enabling purchases.

The opt-in `npm run build:netlify` and generated Node handler passed local health,
current/historical model and stored-image checks. The deployed package includes
the Linux RHEL engine and excludes environment files, private configuration,
backups and secret literals. Hosted database reads and Shopify callbacks are
recorded separately in the acceptance evidence.
The default `npm run build` and local server remain available. Detailed setup,
runtime constraints and migration handling are in
[the Netlify hosting instructions](docs/hosting-netlify.md).

### This Windows workspace's local database

For development only, the helper can use an optional isolated PostgreSQL binary installed under ignored `node_modules`:

```powershell
npm.cmd install --no-save --package-lock=false embedded-postgres@16.14.0-beta.17
npm.cmd run dev:postgres
npm.cmd run db:migrate
```

It starts only this app's own cluster at localhost:54335, installs no system service, and keeps data under ignored `.cache/development-postgres`. It preserves existing Shopify credentials and a real configured database URL; only the unchanged example database placeholder may be replaced. Stop this cluster with `npm.cmd run dev:postgres -- --stop`. An existing Microsoft runtime can be discovered for the native Windows binary; `POSTGRES_RUNTIME_DIR` provides an explicit override without changing system software.

Single-merchant apps installed in the same Dev Dashboard organization may use `CLIENT_CREDENTIALS_AUTH=true` and `npm.cmd run connect:installed`. This obtains a real short-lived offline token and stores it in PostgreSQL. The adapter renews it before expiry only for `PILOT_ALLOWED_SHOP`; no token is sent to the storefront. After changing approved installation scopes, reconnect to refresh the stored grant.

### Exact existing-catalog commerce setup

`npm.cmd run setup:commerce` is read-only and produces `.cache/commerce-setup.review.json`. It inspects only the four approved mapped diamonds and the engraving service handle. After explicit user approval and a temporary installation grant, `PILOT_COMMERCE_SETUP_APPROVED=true` plus `npm.cmd run setup:commerce -- --apply` performs the reviewed setup. It creates no duplicate Lumen or diamond products, initializes stock only for previously untracked approved stones, uses Shopify's idempotency/CAS controls and creates/publishes the missing USD 45 engraving service. Existing tracked quantities are preserved on reruns. Remove setup permissions and renew the read-only session immediately afterward.

The broader `seed:development` helper is available only for a genuinely empty partner development store and requires its own explicit setup authorization. It is not needed for Aerow, where exact matching products already exist.

## APIs and persistence

Shopify signs requests under `/apps/ring-builder` and forwards them to `/proxy/*`. The SDK verifies the signature and retrieves the installed offline session. No unauthenticated direct backend request can mint a quote.

| Storefront route | Behavior |
| --- | --- |
| `GET /bootstrap` | Current mapped Shopify catalog, rules and asset version |
| `GET /diamonds?shape=Round&origin=Natural&minCarat=1&maxCarat=2&page=1` | Published catalog search, filters, sorting and bounded pagination |
| `GET /diamonds/:id` | Current eligible stone by target ID or original-store alias |
| `POST /quotes` | Validate the complete selection against Shopify; mint a ten-minute signed quote and immutable design snapshot |
| `POST /designs` | Confirm `{quoteId, reference}` and return the already saved design |
| `GET /designs/:id` | Read-only, unguessable share link; no edit capability |

Quote requests follow `shared/contract.ts`. Send a stable `requestId` UUID for each logical attempt and reuse it after an uncertain response: the database returns the same saved quote for identical retries and rejects changed selections with that ID. Prices supplied by the browser are rejected. Unsupported variants, incompatible shapes, unavailable stock, invalid engraving or missing setup fail closed. A quote does not reserve a diamond or freeze the eventual Shopify checkout price. Every new add/edit requests a fresh quote.

The immutable snapshot retains the actual component IDs, manufacturing selections, engraving, price context, rule/asset versions and `visual-unverified` fitting status. A cart group is separate from the saved design ID. Editing creates a new snapshot and updates the existing cart group.

Preview uploads accept PNG/JPEG data up to 500 KB and 2048 pixels per side, validate image signatures/structure and persist bytes atomically with the immutable design. Public UUID image URLs expose the display asset; canonical configuration data remains the authority for manufacture and pricing. Share links reveal the selected engraving to anyone who has the link. There is no public mutation API for saved records. `PREVIEW_STORAGE=r2` is an optional future mode requiring separately supplied bucket credentials; it is not used by the $0 pilot.

Versioned public GLBs can be served through the app's whitelisted `/model-assets/:filename` resource with CORS enabled, allowing the Shopify-origin viewer to load them. `ASSET_BASE_URL` can instead point to an R2/CDN model directory configured for storefront GET access. Neither route grants access to configuration files or credentials.

## Order verification and retries

The Shopify SDK verifies webhook HMAC before any database write. Order receipts retain only order ID, payment state and line-item manufacturing fields. They exclude unrelated customer contact details. Receipts are keyed by shop/topic/webhook ID, and associations are unique per shop/order/cart group.

The handler verifies every expected component variant, quantity, configuration property and signed reference. A changed/incomplete configuration is marked `review_required` and shown in diagnostics. Unknown design IDs and pilot components with removed group markers produce a durable receipt marked for review. Transient database failures return HTTP 500 so Shopify can retry. `npm.cmd run webhooks:retry` replays up to 100 failed/pending verified receipts after recovery.

Shopify manages inventory. This app never decrements inventory a second time, restocks a refunded stone, or claims a cart selection reserves it. Strict enforcement against direct cart manipulation is outside standard-cart pilot scope.

The pilot's new theme copy lives in `general.atelier_ring_cart` and `general.atelier_ring_builder`. Other storefront locales contain English fallback values for these two namespaces until translated; existing translations are preserved. The app extension includes its own default English storefront and schema locale files.

## Validation

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build:storefront
npm.cmd run build
```

The optional `npm.cmd run test:database` suite initializes and stops its own disposable PostgreSQL cluster using the extra test binary above. It validates real SQL migrations/persistence and actual Shopify SDK HMAC behavior against explicit test Shopify payloads, without placing an external order. Test data remains isolated beneath ignored `.cache`.

Run theme build and Shopify theme checks from the repository root. See `docs/acceptance.md` for the evidence required before calling the milestone complete. Generated GLBs and their TypeScript sources remain included for review; physical fitting remains unverified until approved manufacturer dimensions are supplied.

Primary references: [Shopify React Router template](https://github.com/Shopify/shopify-app-template-react-router), [app proxy authentication](https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/public/app-proxy), [Ajax cart](https://shopify.dev/docs/api/ajax/reference/cart), [Admin product variants](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant).
