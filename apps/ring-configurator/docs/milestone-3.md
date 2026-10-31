# Milestone 3: Multiple settings and controlled 3D assets

Status: implemented and verified locally. Hosted deployment, merchant publication
and two real development-store checkout checks are pending. Do not call this
milestone fully accepted until the pending checks below have evidence.

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
4. With the existing protected server environment and
   `SOLITAIRE_PRODUCT_ID=15460741284088`, run
   `node --env-file=.cache/netlify.env --import tsx scripts/prepare-milestone-three.ts`.
   The default action is inspection only; it writes a private local mapping report.
5. After verifying the deployed assets, add `--save-draft` to save a revision-
   protected two-family draft. This command never publishes the customer catalog.
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
after local implementation. The active published version and draft revision also
remain unchanged. Repeat this comparison after hosted checkout verification. Physical-phone FPS is still pending and
is not established by desktop rendering or browser emulation.

Pending acceptance: hosted deployment, authenticated two-setting merchant preview
and publication/rollback, desktop/mobile hosted journey, two actual test orders,
post-checkout snapshot hash comparison, and physical-phone performance evidence.

References: [Shopify product modeling standards](https://help.shopify.com/en/partners/manage-clients-stores/creating-media/3d-models/creating-3d-models),
[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator),
[Shopify pagination](https://shopify.dev/docs/api/usage/pagination-graphql),
[Shopify read throttling](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits).
