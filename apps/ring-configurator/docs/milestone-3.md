# Milestone 3: Multiple settings and controlled 3D assets

Status: deployed to the development pilot on 31 October 2026. Hosted merchant
preview, publication/rollback and both actual Shopify test orders passed.
Physical-phone performance and manufacturer fitting remain unverified; customer
visual approval is still required before production acceptance.

Open the [development builder](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128)
or [merchant catalog](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app/catalog).
The builder uses unpublished theme `188667003128`; the live theme was not published.

The audited backend is active at `https://aevow-ring-pilot.netlify.app`, deployment
`6ae5a566e54c9fc03c84ecce`. Private deployment `6ae591cf621f0fd9c2014c51` was
verified first with purchases disabled, including both new assemblies, the
eight-file asset report and an exact historical preview hash. The production
deployment uses the existing approved server environment, with development-store
purchases enabled. Shopify app version `milestone-3-multi-setting-v1` /
`1189143150593` is released. Hosting remains on the existing Free account.

The approved temporary deployment token was revoked after verification. It is
absent from Netlify's token list, a scoped API check returned 401, and the ignored
local token file was deleted. Existing server credentials remain server-only.

The two explicitly approved QA product copies supplied the test orders below.
Shopify consumed their inventory naturally. Both mappings are now disabled in
published catalog `aaee4dee-6910-465d-8014-be7743a4d58f`, draft revision 15;
they cannot authorize new quotes. Original diamond inventory was not restocked.

## Scope and mappings

The builder supports The Lumen / Hidden halo and The Aevow Solitaire, both with
High polish bands, four supported metals and Round/Oval assemblies. Shopify
provides setting prices, available size variants and inventory at runtime.

Read-only inspection of the existing development store found:

| Setting | Development-store product | Variants | New model version |
| --- | --- | --- | --- |
| The Lumen | 15460741185784 | 44 | lumen-visual-v3 |
| The Aevow Solitaire / High polish | 15460741284088 | 44 | solitaire-visual-v1 |

The Knife edge and Pavé Solitaire products are separate products and are not
included in this milestone. The setup inspection reported no mapping errors.
Existing test orders consumed three of the four original stones; those warnings
are expected and no purchased stone was automatically restocked.

## Merchant workflow

Open Manage catalog → Settings. Each setting draft has a stable ID, display name,
legacy style label, Shopify product, model family/version and its own eligibility
rules. Configure supported metals/shapes, optional allowed sizes/diamond IDs,
carat bounds and engraving. Blank size/diamond restrictions mean all applicable
mapped variants. These are visual pilot eligibility rules, not manufacturer
fitting approval.

Add setting draft or duplicate an existing setting into a disabled draft. Supply
its distinct Shopify product and approved model before enabling it. Save, validate,
preview, then publish through the existing revision-protected workflow.

Model creation remains a reviewed source/build operation. Merchants select an
approved model release; they cannot publish arbitrary remote model URLs. The
manifest permits up to ten setting definitions, while end-to-end coverage in this
milestone is specifically two setting families and 200 curated diamond fixtures.

Use existing publication history to restore an earlier configuration. Restoration
checks current Shopify mappings and exact model file hashes, creates an audited
release and preserves all saved designs and orders.

## Data and compatibility

The additive manifest schema supports `schemaVersion: 2` and `settings[]`.
Legacy manifests adapt to setting ID `lumen` without rewriting their database
records. The singular bootstrap `setting` remains available for older extensions.

Selections support `settingId` and `bandId`. New URLs carry a stable `setting`
parameter; `style=Hidden+halo` and the original review URL continue resolving to
The Lumen. Contradictory IDs and labels are not silently accepted.

One shared compatibility module drives UI completeness, selection reconciliation,
diamond filtering and server quote validation. A setting change retains compatible
metal, shape, diamond, size and engraving, clears invalid choices, and invalidates
the previous quote. Browser request prices and asset versions cannot authorize a
purchase.

New immutable snapshots include schema version, setting title, exact asset version
and `multi-setting-v1` rule version. Every component carries setting, band, model,
catalog and rule references. The verified order webhook retains these properties.
Historical snapshots and preview bytes are not migrated or rewritten.

No relational database migration is required: the additional fields live in
versioned manifest and immutable snapshot JSON records.

## Asset pipeline

Editable TypeScript geometry creates two shapes for each family. Solitaire has
six prongs and no hidden halo stones. Named Band, CenterStone, BasketBridge,
HeadAnchor and EngravingRegion nodes define the assembly contract. Band sizing is
independent of the head and center stone.

Run `npm run models` to export. Existing versioned files cannot be overwritten with
different bytes; change the asset version before changing published geometry.
The four historical Lumen v1/v2 files are retained unchanged.

Run `npm run models:check` to validate all eight GLBs with Khronos' official glTF
validator and check required nodes, plausible bounds and the size budget. The
generated asset report records SHA-256, size, bounds and fitting status. Both
normal and Netlify production builds run this check. Publication independently
checks deployed file bytes against the report.

Each new GLB is below 0.5 MiB; each family's two GLBs total below 1 MiB, within the
proposed 4 MB family budget. All models remain representative, with illustrative
dimensions and physical fitting unverified. No manufacturer CAD or approved
gemstone tolerances were provided.

## Setup and deployment

1. Install locked app dependencies, including development dependencies for builds.
2. Run type checks, app/integration/cart tests, model checks and storefront build.
3. Deploy backend assets before publishing a catalog that references them. Follow
   the audited nested-project packaging procedure in milestone-2.md; preserve
   API v2 routing, Linux Prisma and all historical assets.
4. For a store whose saved draft still contains only Lumen, use the existing
   protected server environment and
   `SOLITAIRE_PRODUCT_ID=15460741284088`, run
   `node --env-file=.cache/netlify.env --import tsx scripts/prepare-milestone-three.ts`.
   The default action is inspection only; it writes a private local mapping report.
5. After verifying the deployed assets, add `--save-draft` to save a revision-
   protected two-family draft. This command never publishes the customer catalog.
   This is a one-time setup operation, already applied to this development pilot.
   Manage existing two-family drafts in Admin instead of rerunning it.
6. Preview and publish the saved draft in authenticated Shopify Admin. Verify the
   storefront and release the corresponding theme extension.
7. Complete dedicated development-fixture test orders for both families, verify
   signed webhook associations, then record their order/design/release references.

Use the existing free hosting/database. Purchase guards remain restricted to the
explicit partner development store. Standard-cart limitations remain: cart
selection does not reserve a stone, and pre-cart validation does not strictly
enforce complete-ring rules against direct checkout manipulation.

## Verification record

| Check | Evidence |
| --- | --- |
| App unit/regression tests | 82 passed, including all 16 family/shape/metal combinations |
| Real disposable PostgreSQL integration | 28 passed, including two-family publication, distinct prices/variants, signed webhook properties, missing assets and rollback to legacy |
| Theme cart adapter | 18 passed, including a cross-family edit preserving the diamond and another cart group |
| Khronos GLB checks | Eight current/historical files; zero validation errors |
| Type check and builds | TypeScript, storefront, normal production and Netlify production builds passed |
| Live mapping inspection | Two Shopify products, 44 variants each; zero mapping errors; no draft or publication writes |
| Desktop browser | Both setting cards, real WebGL, correct Solitaire switch, one canvas after repeated switching |
| Mobile browser emulation | 390 px viewport/document width, two 162 px setting cards, one ready canvas and fixed action bar |
| Resource accounting | 66 assembly/material/size/engraving changes; no errors, zero resource growth after warmup, zero residual probe resources after destroy |
| Packaging audit | 733 ZIP entries, eight GLBs, Linux Prisma; zero private paths or credential matches |
| Theme check | Zero errors, 185 existing baseline warnings; app sources explicitly excluded from theme Tailwind scanning |

All ten pre-change design snapshots and preview hashes were rechecked unchanged
after both hosted checkouts and catalog cleanup. Catalog history changed through
the expected publication and restore operations; saved design records did not.

## Hosted acceptance evidence

The authenticated merchant draft preview rendered both families with purchasing
disabled. Publication `2d057d86-fad6-4b88-a8a1-faeb5bb29271` enabled the new
models. Restore `2c2567cd-5a84-4199-a05b-8e3ea7fd292d` returned to legacy
catalog `d0036c5b-35af-40ae-bc53-7b09700f4326`; the actual storefront bootstrap
then contained only Lumen. Restore `9978c598-3c18-499b-8b03-465b5f7e4159`
returned to the two-setting release. Both checkouts used the subsequent QA
catalog `bc84c60f-7e14-4741-843c-a099dd081cb2`.

| Hosted check | Recorded result |
| --- | --- |
| Lumen review-link restoration | Platinum, Round 2 ct QA stone, size 4.5, `3ertyui`, USD 5,595 |
| Actual double-click | One group; three component lines, quantity one each |
| Cross-setting cart edit | Lumen to Solitaire and back retained group `216dade1-4f16-4503-b76a-0f8640b58330` and the Round stone; each setting/model/total changed correctly; no duplicate lines |
| Mobile hosted Solitaire | 390 px viewport and document width, one ready WebGL canvas, fixed enabled review action; yellow gold/Oval total USD 4,595 |
| Browser Back/Forward | Review to engraving and back restored the correct step and selections |
| Engraving count | Seven-character `M3 OVAL` displayed 13 characters remaining |
| QA cleanup | Both mapped fixture variants disabled, zero stock at both locations; bootstrap contains no QA stones; new quote rejected with 422 `INCOMPATIBLE_DIAMOND` |
| Isolated QA cart after checkout | Empty; user's default browser cart was not changed by this test |

Shopify's theme preview bar overlays the bottom of mobile preview screenshots.
The mobile layout and action were verified in browser emulation; these checks do
not establish physical-phone touch behavior or FPS.

### Actual Shopify test orders

Both orders used Shopify's Test Payment Gateway, fictional contact details and
free Standard shipping. No real payment was made. All three variants and every
configuration property were compared with each immutable snapshot. Each signed
Shopify `orders/create` webhook processed once and created a `verified_paid`
association with zero discrepancies. Both public JPEGs matched database bytes.

| Evidence | Lumen / Hidden halo | Aevow Solitaire |
| --- | --- | --- |
| Test order | [#1004](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18981061460216) | [#1005](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18981069357304) |
| Total USD | 5,595 = 2,450 + 3,100 + 45 | 4,595 = 1,450 + 3,100 + 45 |
| Selection | Platinum / Round / 4.5 / `3ertyui` | 14K yellow gold / Oval / 5 / `M3 OVAL` |
| Setting variant | 67890588942584 | 67890592579832 |
| Approved QA product | 15465670541560 | 15465678602488 |
| Approved QA diamond variant | 67913931817208 | 67913959604472 |
| Engraving variant | 67911152632056 | 67911152632056 |
| Immutable design | c8c40a5c-32c0-45c4-9e75-7ff94d3cf571 | aa54ee26-b0f5-47e2-8c2b-e8ba1ac6728a |
| Model | lumen-visual-v3 | solitaire-visual-v1 |
| Rules | multi-setting-v1 | multi-setting-v1 |
| JPEG bytes | 17,441 | 9,176 |
| JPEG SHA-256 | e11b3cb97e0da8373ffa2971287ebb0e33c5c9b6de68fbdaca455fdaf5f0345d | 987d56fae64f336f7d4f4a68eee38f3448e8bd1dfcd74af8f40d4837cdfd2e50 |

The QA copies contain sample catalog data and no independently verified lab
certificates. Their mappings carry no certificate claims or original-store ID
aliases. They remain disabled after testing, with orders/designs retained.

Remaining acceptance requires an agreed physical midrange phone, OS/browser and
recorded rotation duration/FPS, manufacturer measurements for physical fitting,
and the merchant's visual review. Browser emulation and representative geometry
do not supply that evidence. Milestone 4 requires separate approval.

References: [Shopify product modeling standards](https://help.shopify.com/en/partners/manage-clients-stores/creating-media/3d-models/creating-3d-models),
[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator),
[Shopify pagination](https://shopify.dev/docs/api/usage/pagination-graphql),
[Shopify read throttling](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits).
