# Milestone 2: Merchant-managed catalog

Scope: the existing development pilot, Hidden halo / The Lumen, High polish,
four supported metals, Round/Oval, and up to 200 curated diamond mappings.
Shopify remains the authority for price, publication and inventory. Models remain
representative with physical fitting unverified.

## Merchant workflow

Open **Aevow Ring Pilot → Manage catalog** in Shopify Admin. The app provides
Catalog, Configuration and Publication history views alongside Overview.

1. Search Shopify products by title, SKU or variant ID. Add the selected variant
   as a disabled draft diamond. Fill in shape, origin, carat, color, clarity,
   cut and any verified certificate details before enabling it.
2. Keep the original-store variant ID when a legacy shared URL needs to resolve
   to this development-store variant. IDs and aliases must be unambiguous.
3. On Configuration, map the Hidden halo product, engraving variant and online
   fulfillment location. Select supported metals/shapes and an engraving limit
   between 1 and 20 Unicode code points. Metal/size variants come from Shopify.
4. Save draft. Incomplete metadata is permitted on disabled entries. Conflicting
   edits are rejected with the local edits retained; load the latest saved draft
   deliberately before replacing your work.
5. Validate the saved draft against Shopify. Missing or invalid mappings block
   publication. Sold-out mapped diamonds produce availability warnings; they
   need not be removed from the managed catalog.
6. Preview the saved draft. The preview and its API require merchant
   authentication. Purchasing and immutable design creation are disabled there.
7. Publish. The server revalidates the saved revision and atomically switches
   the active catalog version. Unsaved edits cannot be published through the UI.
8. Publication history can restore a previous configuration after fresh Shopify
   validation. Restoration creates an audited release and replaces the saved
   draft; it does not restore historic prices or stock.

Catalog editing changes the app database. It does not write products, prices,
stock, publication settings or supplier data into Shopify. Existing read scopes
remain sufficient. Account passwords and server credentials are not editable in
these merchant screens.

## Customer behavior

The eight configuration steps and existing viewer remain. Diamond selection
supports title/certificate search, origin/carat/price/color/clarity filters,
deterministic price/carat sorting and pages of 12 records (API maximum 24).
The selected stone persists while browsing another results page. Superseded
requests are cancelled, and the viewer is not remounted by result changes.

`GET /apps/ring-builder/bootstrap?paged=1` returns the initial page and rules.
The legacy bootstrap response remains supported for older extension versions.
`GET /diamonds` accepts the filter, sort, page and published-version parameters.
`GET /diamonds/:id` resolves a current eligible diamond or its legacy alias,
including for a query/shared link outside the initial results page.

Browsing responses may reuse a server-instance cache for **20 seconds**, keyed
by shop and published version. Observed timestamps represent the underlying
Shopify read. Buyer-market checks cover the displayed page and selected stone,
rather than requesting every managed product from the storefront.

New purchase attempts request fresh server validation. Uncertain retries keep
their request identity for cart reconciliation. Changed prices or catalog
versions require a refreshed quote; a cached browser quote cannot bypass that
check. Quotes/designs and component properties retain the catalog version.

New immutable snapshots retain diamond facts. Older snapshots retain their
original choices, preview, price context and component description. A removed
or disabled diamond cannot be purchased anew from a historical link. Shopify
checkout and stock accounting retain the Milestone 1 limitations: cart contents
do not reserve a stone or strictly enforce complete-ring rules at checkout.

## Database and deployment

Migration `202610310001_catalog_management` adds CatalogState and CatalogRelease.
It does not rewrite existing sessions, quotes, designs, previews or order data.
The first active release imports the configured pilot manifest. Shopify GIDs
and numeric IDs both normalize to the merchant-facing numeric representation.

Run the migrations, then `npm run catalog:initialize` with the intended shop and
database environment. Catalog saves/publication use revision-based conflict
checks; initialization is serialized per shop. Publication and new quote
persistence also coordinate through the active catalog row.

The database and hosting remain on the existing free Netlify project. The live
Shopify theme is not published by this milestone. Preserve the signing secret,
historical models and existing immutable design records during deployment.

For local Netlify CLI deployments from this nested app, ensure the bundler uses
the app directory as its file base and includes Linux Prisma and `public/models`.
Deploy the generated **source functions directory** `.netlify/v1/functions`,
or a fresh audited manifest with complete route/build metadata. A zip directory
alone can lose the handler's route/API metadata. The CLI can resolve its cache
from the repository root, so inspect that base explicitly. Verify an unpublished
deployment's health, GLB, stored preview and authentication before activation.
Private draft URLs require Netlify login for review.

## Verification record

The approved milestone was implemented and verified on **31 October 2026**.
Fixture catalogs are not purchasable products.
The 200-record tests cover filtering/pagination and nine Shopify batches of at
most 25 component IDs. This is the milestone's tested catalog bound, not a
claim about unlimited catalog capacity or free-tier production throughput.

| Check | Recorded result |
| --- | --- |
| App unit/regression checks | 54 passed |
| Real disposable PostgreSQL integration checks | 23 passed, including actual SDK authentication/HMAC, draft conflicts, publication, rollback, tenant isolation, changed prices and active-version locking |
| Existing cart adapter checks | 17 passed |
| TypeScript and production builds | Type check, storefront build, normal React Router build and Netlify Node build passed |
| Theme checks | CSS build passed; zero theme errors and 185 unchanged baseline warnings; extension release validation passed |
| Real merchant workflow | Saved draft left four customer stones unchanged; published disabled Round lab stone reduced the eligible list to three; restoration returned all four |
| Merchant product search | Shopify returned additional Round products; an extra disabled stone was saved as a fifth draft entry, then removed without publishing it |
| Draft preview | Authenticated Shopify Admin displayed the real 748 px 3D canvas, without fallback; purchasing disabled |
| Search interaction | Real zero-results search retained the selected Oval natural stone and the same canvas instance |
| Collection recovery | After a filter error, reload stayed in the same document, detached the old canvas, rendered exactly one new canvas and restarted search |
| Mobile review and filters | 390 px viewport and document widths both 390; two 171 px filter columns; one canvas and fixed action bar; restored desktop afterward |
| Saved designs | All eight pre-migration design snapshots and preview byte hashes matched exactly after checkout |
| Removed stone | Original Round design retained choices, image and USD 5,595 context; new quote rejected with 422 / INCOMPATIBLE_DIAMOND while the stone was disabled |
| Actual duplicate click | One group, three lines, quantity one each, USD 9,015; same published catalog version on every component |

Netlify deployment **6ae56ea879d058cc94d842ec** serves the existing pilot hostname.
Shopify extension release **milestone-2-catalog-v4**, version **1189081546753**,
retains the existing installation scopes. During verification an initial manual
package lost routing metadata; the prior working release was restored. The
corrected package was then verified privately for health, GLB and exact saved
image database access before the replacement was published. Private verification
used protected deploy-specific function credentials with purchasing disabled.
The checkout evidence below was captured on deployment
**6ae563e7fe3f6f563086d3f0** before the final collection-recovery refinement.
The hosting account was independently reconfirmed as **Free**.

The active catalog is **d0036c5b-35af-40ae-bc53-7b09700f4326**. Its immutable
history is initialize → publish → restore; the restored payload exactly matches
the initial imported configuration. Draft revision **7** contains four original
mappings. Availability follows current Shopify inventory, independently of that
configuration history. Publication history currently displays the 30 most recent
releases.

### Actual test order

[Shopify order #1003](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18980841914616),
confirmation **5U1XAHQ0H**, completed using the Test Payment Gateway and fictional
contact details. Shopify confirms `test=true`, **PAID**, **USD 9,015.00**.
No real payment was made.

| Component | Shopify variant | Quantity | Price |
| --- | --- | --- | --- |
| The Lumen, Platinum / 4.5 | 67890588942584 | 1 | USD 2,450 |
| Oval natural, 1.10 ct | 67890574524664 | 1 | USD 6,520 |
| Personal engraving, 3ertyui | 67911152632056 | 1 | USD 45 |

Design **91985ff9-d20c-45bd-b5dc-3b5bbddea25c** and cart group
**f48a9c81-4e8a-42c9-be8a-445eb4883ff9** retain the exact published catalog
version. Shopify order attributes match all expected properties on all three
lines. The actual signed `orders/create` receipt was processed once and linked
as **verified_paid**, with **zero discrepancies**.

The actual captured JPEG returned HTTP 200 and matched all **27,440 database
bytes**; it was visually inspected. SHA-256:
`d7b12ffbe614647e923ab9a7d53d566ad1450a0d373a42fbcdf4b5994627ceb1`.
The restored design at 390 px retains engraving and original price context while
disabling a new purchase after Shopify consumed the stone's inventory.

This test used a separate browser context with its own initially empty cart.
It did not clear the user's current cart. The purchased Oval natural diamond
was not automatically restocked. The Round natural pilot stone remains available
as of this verification; both lab stones were consumed by Milestone 1 tests.

Review links:

- [Manage catalog in Shopify Admin](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app/catalog).
- [Open the development builder](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128).
- [Restore the Milestone 2 test design](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128&design=91985ff9-d20c-45bd-b5dc-3b5bbddea25c&step=review).

Physical-phone FPS measurement and manufacturer fitting verification remain the
previously recorded limitations. Browser emulation does not establish physical
device performance. This milestone does not publish the live Shopify theme.
