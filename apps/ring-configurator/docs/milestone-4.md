# Milestone 4: Checkout integrity and order operations

Status: implemented and deployed to the **Aerow partner development store** on 31 October 2026. The live Aevow store has not been changed. Physical fitting and physical-device performance remain unverified.

- [Development builder](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128)
- [Configured orders](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app/orders)
- [Operations health](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app/operations)
- Hosted backend: `https://aevow-ring-pilot.netlify.app`, production deploy `6ae5fdc4715f9054ca68779b`
- Released Shopify app version: `milestone-4-order-ops-v1` (`gid://shopify/Version/1189400150017`)
- Active development checkout validation: `gid://shopify/Validation/178127096`, `blockOnFailure=true`

The partner development store reports Shopify Plus. The user's intended live store is also reported to be on Shopify Plus, but its installation, plan capabilities, products, checkout configuration and order flow have not been verified. No live theme or live checkout was modified. The builder remains on unpublished development theme `188667003128`.

## Delivered behavior

The checkout validation function protects the configured-ring product and variant registry at Shopify checkout. The builder attaches a short-lived signed ticket to all components of a ring; the function checks the ticket, complete component set, quantities, group consistency and engraving. The public verification key is stored in the validation's app-owned metafield. Private signing material stays on the server. The registry expands before catalog publication, so older managed components remain protected when a diamond is later disabled. This does not reserve stock, freeze prices, or verify physical stone fitting.

Order webhooks acknowledge only after a verified, minimal event pointer is durably stored. A scheduled worker runs every five minutes, leases and processes eligible receipts, rereads the current Shopify order, and records a versioned order projection and audit. A checkpointed reconciliation pass searches the granted recent-order window every fifteen minutes to recover missed events. Transient failures retry with bounded backoff; exhausted receipts remain visible for merchant action. Order events retain order ID and manufacturing fields without unrelated customer contact data. Separate payment, component-verification and merchant-review states prevent a paid order from appearing manufacturing-approved merely because the components match.

In Shopify Admin, **Configured orders** supports status, payment, setting and verification filters. Each detail page shows the immutable design, preview, selected options, purchased component variants and prices, audit history, Shopify order link, printable review sheet, a current-order recheck and an immutable merchant decision. **Operations health** shows the queue, last worker/reconciliation success, checkout guard status, failed receipts and a retry action. The merchant decision is an audit acknowledgement; it does not change payment, fulfillment, inventory or manufacturer approval.

The database migration `202610310002_order_operations` adds durable order projections, audit records, merchant actions, worker checkpoints and receipt lease/retry fields. It leaves earlier immutable designs and preview bytes intact. Model asset delivery was hardened for serverless hosting: approved GLBs and the build report are served by the static `/models` path with CORS, and catalog publication checks their exact SHA-256 and length. Hosted Round and Oval viewers were confirmed to render with one WebGL canvas after the asset fix.

## Actual Shopify lifecycle evidence

Two explicitly approved development-only diamond copies were enabled temporarily. Both checkouts used Shopify's test gateway and fictional QA contact details; no real payment was made. The original four stone products and their inventory were untouched.

| Check | Lumen / Hidden halo | Aevow Solitaire |
| --- | --- | --- |
| Shopify order | [#1006](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18981432099064) | [#1007](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18981476860152) |
| Checkout total | USD 5,595 = 2,450 setting + 3,100 diamond + 45 engraving | USD 4,595 = 1,450 setting + 3,100 diamond + 45 engraving |
| Selection | Platinum / Round / size 4.5 / `M4 ROUND` | 14K yellow gold / Oval / size 5 / `M4 OVAL` |
| Paid-state projection | Three correct component variants and saved preview; components verified | Three correct component variants and saved preview; components verified |
| Lifecycle action | Full refund of USD 5,595 | Cancellation with full refund of USD 4,595 |
| Final app projection | `REFUNDED`, review required; purchase snapshot retained | `REFUNDED`, cancelled, review required; purchase snapshot retained |

Refund/cancellation restocking and notification emails were **off**. The app's scheduled worker processed the changes without a failed or terminal receipt. Both orders have immutable `needs attention` QA decisions stating that they must not be manufactured. Shopify archived the refunded test orders; the app preserved their original component IDs, quotation and preview for review.

The approved QA mappings were disabled and the catalog was republished after testing (draft revision 20). Both QA variants are again **1 on hand, 1 committed, 0 available** at the Shop location, with overselling off. This matches their pre-test state; no refund or cancellation restock was applied. The four original mapped stones remain the customer catalog.

The checkout function passed eight runtime scenarios, including valid complete rings and incomplete, duplicated or altered groups, with 3,036,922 instructions for the valid three-line case, under Shopify's 11-million limit. The browser exercise confirmed valid purchases. A tampered cart was observed at checkout entry and restored before payment; that observation does **not** establish a live rejected payment. The rejection evidence is the function's runtime tests, not a submitted tampered checkout.

Pending-payment transitions and recovery from deliberately dropped webhooks were covered by the real PostgreSQL integration suite, not by a separate live pending-payment order. Shopify's test gateway moved both live QA orders directly to paid. This distinction matters when reviewing acceptance.

## Data protection, recovery and rollback

The final production-branch backup was captured through Netlify's current read-only database connection, encrypted with AES-256-GCM, and stored only in ignored local `.cache`. It contains 13 table groups, 19 immutable designs, 7 configured orders, 69 webhook receipts and 2 merchant decisions; **no Shopify session tokens**. All 16 designs and preview hashes from the pre-Milestone-4 baseline were unchanged. A full restore into a fresh disposable local PostgreSQL schema reproduced all table hashes; the schema was then dropped. The encrypted backup SHA-256 is `691b3e1113349873ae16baaba2bd97e1b7e4703032e0453e95d6ddf2855e9724`.

Netlify Database connection credentials can change across deploys. For future backups, query the **current production branch** through Netlify's database API or supported tooling; do not assume an older ignored `.cache/netlify.env` URL points to the active branch. Never print connection strings or store them in Git. The local decryption key and backup are required together for recovery. A recovered installation must reauthorize Shopify because session tokens are intentionally excluded.

For rollback, first disable new purchases for the development pilot if checkout integrity or order processing is uncertain, and preserve the current database. Use the previous released app/deploy and the catalog's audited restore operation only after confirming their compatible schema and validation registry. Do not delete the validation while protected cart lines remain. A database restore must target a fresh isolated schema first, compare all hashes, then follow a separately reviewed production recovery procedure. Existing Shopify orders remain Shopify's source of truth; the app rereads them during reconciliation. Do not use the restored database to roll back Shopify payments or inventory.

## Validation and remaining acceptance

| Check | Result |
| --- | --- |
| App unit/regression suite | 97 tests passed locally |
| Real PostgreSQL integration | 48 checks passed locally, including pending payment, retries, reconciliation, refund, cancellation, backup and restore |
| Theme cart adapter | 18 tests passed |
| Checkout Function | Rust tests and eight Shopify WASM runtime cases passed in CI; valid three-line case used 3,036,922 instructions |
| Build and type checks | App type check, storefront/Netlify production builds and package audit passed |
| Model delivery | Static GLBs returned 200 with CORS; both hosted setting viewers rendered |
| Theme | `pnpm tw:build` passed; `shopify theme check` reported zero errors and 185 existing warnings |
| Packaging | 793 ZIP entries, 16 GLBs, Linux Prisma; no private files or credential matches |
| Hosted operations | Seven configured orders; both new orders reflected their final Shopify lifecycle states; no failed/dead-letter receipts at verification |

The checkout guard has only been installed on the partner development store. Before deploying to a live Shopify Plus store, verify its plan/capability, install and configure the app there, map real products and inventory, review storefront/checkout behavior and separately approve any live store changes. Manufacturer measurements and tolerances are still required before physical fitting can be claimed. A physical Android and iPhone touch/FPS check is still outstanding; browser emulation does not satisfy it. Free Netlify usage and database limits need ongoing monitoring.
