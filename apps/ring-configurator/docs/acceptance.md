# Milestone 1 acceptance record

The milestone is complete only after real integration and customer acceptance checks below have recorded evidence. Source completion and a local visual preview do not substitute for installation or checkout.

| Check | Evidence/status |
| --- | --- |
| Shopify app registered and installed in development store | Registered and installed in aerow-qdbfzxwi.myshopify.com; real Admin API confirms partner development store |
| PostgreSQL migration applied against provisioned database | Both migrations applied to Netlify's managed PostgreSQL. Six quotes/designs, preview bytes and the test-order records transferred with exact hash verification; existing Shopify session tokens excluded |
| Four diamond IDs and all metal/size variants mapped on development store | 44 existing Lumen variants and four exact existing diamonds mapped in config/pilot.mapping.json; no duplicates created |
| Free preview storage and model delivery | PostgreSQL image storage verified byte-for-byte through public HTTPS; versioned GLBs served by app with CORS. R2 is not required or activated |
| Hosted deployment and embedded diagnostics | Public Node backend at https://aevow-ring-pilot.netlify.app; real Shopify proxy and embedded admin verified on that hostname |
| Round/Oval geometry, metal switches, rotation/zoom/reset/views | Real WebGL rendering and preset controls verified; v2 ring capture visually inspected. User visual review remains pending |
| US size changes leave diamond dimensions unchanged | Automated geometry regression plus local review |
| Seven-character engraving yields 13 remaining; text is retained | Automated server validation plus storefront review |
| Original URL restores Platinum, Round 2ct lab, size 4.5, 3ertyui | Current real Shopify quote and PostgreSQL snapshot verified USD 5,595; storefront journey review recorded separately |
| Shape change clears incompatible stone; Back/Forward restores state | Storefront regression and browser review |
| Double-click, uncertain response and retry do not duplicate components | 17 cart tests pass. Actual double-click added one group with three lines, quantity one each, USD 5,595 |
| Existing group edit/removal affects only that group | Actual size edit 4.5 to 5 replaced the setting, retained the diamond and three-line group. Removal returned the cart to its prior empty state |
| Actual Shopify test checkout retains all variants, inscription and references | Order #1001 / 18980456628472, confirmation QXKIZHWPI, test=true, PAID, USD 5,595; all three components and engraving verified |
| Verified/deduplicated order webhook associates exact saved design | Actual signed orders/create receipt processed once; persisted association verified_paid, zero discrepancies |
| Two buyers compete for a one-stock stone | After checkout, a separate browser context with its own empty cart received 422 / already sold out, with no cart mutation. This verifies post-purchase conflict, not simultaneous reservation |
| Rendering at least 30 FPS during rotation | Pending agreed physical midrange phone; record device, OS/browser, duration and FPS |
| Repeated changes/remounts do not continue growing GPU memory | Eight shape/material changes and two remounts plateau after warmup: resource-count delta zero, one active context, old contexts released |
| App tests/typecheck/build; theme CSS build/theme check | 46 app tests, 13 real PostgreSQL integration checks, 17 cart tests pass; typecheck, normal/Netlify builds and CSS build pass. Theme check: zero errors, 185 unchanged baseline warnings; extension check clean |

## Recorded backend validation

- 46 unit/regression checks pass, including server compatibility/price validation, Unicode engraving, quote signatures, public-asset path restrictions/CORS, bounded preview images, single-merchant grant isolation, storefront state and versioned geometry.
- Thirteen checks passed against a real disposable PostgreSQL 16 instance using the committed migrations: atomic snapshots/preview bytes, concurrent request-id deduplication, tenant isolation, fulfillment-location stock, host-change image restoration and the actual Shopify SDK's webhook authentication/deduplication. Shopify Admin catalog responses in that integration suite are explicit test doubles; the actual test order is separate evidence below.
- The real installed Aerow connection returns USD catalog prices and the 44 Lumen variants/four diamond mappings. The user-approved exact setup enabled tracking with one unit and DENY policy on only those four stones, and created/published the missing USD 45 engraving service (variant 67911152632056). No Lumen or diamond duplicates were created. The temporary product/inventory/publication/location permissions were then removed and the refreshed installed grant was verified to contain only product/inventory/order reads and app-proxy access.
- Actual Shopify prices plus the persistent local PostgreSQL database verified the original USD 5,595 configuration and idempotent quote replay. A separate database-backed test preview returned HTTP 200 image/png over the public HTTPS tunnel with byte-for-byte image matching. That storage proof used a small test PNG and did not claim to be a shopper's captured ring or a checkout.
- Connected production paths do not consume the captured reference catalog. That timestamped capture is used only by the explicitly disabled-for-purchase visual preview and test fixtures.
- The editable model output is representative. Repeated certificate numbers in the source catalog have not been independently verified and do not constitute certificate approval.

## Actual checkout evidence — 31 October 2026, Europe/Kyiv

[Shopify test order #1001](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18980456628472) used the active **Test Payment Gateway**, documented success number `1`, free Standard shipping and fictional contact details. **No real payment was made.**

| Component | Development variant | Quantity | Price |
| --- | --- | --- | --- |
| The Lumen, Platinum / 4.5 | 67890588942584 | 1 | USD 2,450 |
| Round 2.00 ct, lab-grown | 67890574688504 | 1 | USD 3,100 |
| Personal engraving | 67911152632056 | 1 | USD 45 |

Inscription **3ertyui** and the matching signed reference, group, saved-design reference, fitting label, asset version and preview reference survived on all appropriate order lines. Saved design `c3151760-c9b7-490d-b74e-935c7c1190fa` uses `lumen-visual-v2`. The public JPEG returned 200 and exactly matched all **28,363 database bytes**, SHA-256 `c54cbc9c92ac9992191139a07486396b4569be750440b669db2aa52bf870a4e4`.

Shopify deducted the purchased stone's inventory. It has not been automatically restocked. A saved-design link opened in a separate browser context preserved every original choice, original USD 5,595 price context, 785 px preview and v2 model while disabling purchase until an unavailable component is replaced. New query links use current stock and prices.

Desktop and 390/320 px mobile emulation render real WebGL without horizontal overflow. Shape changes, filtered empty results, browser Back, engraving count and mobile action bar were checked. Physical-phone FPS remains pending; browser emulation is not physical-device verification. The four metals, Round/Oval assets and retained v1/v2 rendering have automated and browser coverage. Engraving was visually checked in the actual captured ring preview.

The actual app block is retained in the development page template. Group Edit and View cart links, app navigation and shared links preserve unpublished theme context. Shopify app release **milestone-1-v3**, version `1188897095681`, includes these changes. Reviewed source is on `feat/ring-configurator-pilot`, initial commit `ec117b2`; staged credential comparison found no secret matches or ignored local-state files. Client bundles contain no server credential variables.

## Persistent hosting status

Render requested card verification, so no Render service was activated. R2 was not activated. Netlify project **aevow-ring-pilot** (`958dda5f-dbf8-41f9-bfb5-b404cc6c199c`) and its database were created on the confirmed **Free** plan, with 300 monthly credits and no payment method. Exhausting the allowance can pause the app.

The user explicitly approved moving saved designs, preview images, quotes and test-order/webhook records to that database, and separately approved storing backend credentials in Netlify. Existing Shopify session tokens stayed local; the hosted app obtained a fresh session. All thirteen environment variables are protected secrets in the production context with the standard builds/functions/runtime scopes, excluding post-processing. No paid plan or payment method was added.

The audited Node function package includes the Linux RHEL Prisma engine, versioned models and runtime code, with no environment files, caches, private manifests, backups or secret literals. The public cloud preview returned HTTP 200 and matched the original JPEG hash, proving an actual Linux Prisma database read. Round/Oval GLBs returned HTTP 200 with the expected bytes and cross-origin headers; the Shopify browser independently fetched the hosted Oval model and preview successfully.

Shopify release **milestone-1-hosted**, version `1188918165505`, points the installed app, proxy and webhooks to `https://aevow-ring-pilot.netlify.app`. Embedded admin loaded from that origin and displayed all 44 setting variants, live diamond availability and the migrated verified order. The actual Shopify bootstrap returned connected mode, v2 assets and current stock; the saved-design endpoint restored the original selection and USD 5,595 price context with its preview URL on the stable host. Deployment `6ae51c6e2757e0c2fed84339` enables pilot purchases while retaining the partner-development-store guard.

### Hosted checkout verification

[Shopify test order #1002](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18980498178296), confirmation **2MTJAE5UA**, completed through the hosted backend at **USD 5,595.00**, with `test=true` and financial status **PAID**. It contains setting `67890588942584`, Oval lab-grown diamond `67890574557432`, and engraving `67911152632056`, quantity one each. The confirmed inscription is **3ertyui**. A double-click before checkout still produced exactly one ring group and three lines.

The cloud quote created immutable design `752a6741-f23c-4171-9774-b6073010bcd6` and stored its actual captured preview directly in the managed database. Every component's order properties match that design and use the stable Netlify preview URL. The real signed Shopify webhook reached the hosted app at **22:42:03 UTC**, was processed in one attempt, and produced **verified_paid** with **zero discrepancies**. Its JPEG returned HTTP 200, exactly matched all **28,743 database bytes**, and was visually inspected. SHA-256: `0b4a5f354333258cc6e3771b6942a79706c021abf122fb1d5e23e39e8d1fd209`.

Both completed orders used Shopify's test gateway; no real payment was made. Shopify consumed the two lab-grown test stones. They remain unavailable until a deliberate inventory reset; the two natural pilot stones remain available. Detailed sanitized evidence is in `docs/test-order.md`.

The temporary Netlify deployment personal access token was deleted after verification. Runtime app/database credentials remain protected in Netlify; future deployments require a fresh operator login/token.

A final hosted Shopify browser check at 390 px rendered a real canvas, loaded the Round GLB from Netlify, kept the action bar fixed, and measured page width at exactly 390 px with no horizontal overflow or configuration errors. The review tab was then restored to desktop view.

## Review links

- [Open the Shopify development builder](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128).
- [Review the original tested Round design](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128&design=c3151760-c9b7-490d-b74e-935c7c1190fa&step=review).
- [Review the hosted Oval design](https://aerow-qdbfzxwi.myshopify.com/pages/design-your-ring?preview_theme_id=188667003128&design=752a6741-f23c-4171-9774-b6073010bcd6&step=review).
- [Open the installed pilot diagnostics](https://admin.shopify.com/store/aerow-qdbfzxwi/apps/aevow-ring-pilot/app).

The Shopify links require development-store access. Saved designs retain their original choices when stock changes; choose an available replacement before purchasing again. The remaining acceptance items are user visual review and measured FPS on an agreed physical midrange phone.

Physical fitting remains **representative and unverified**. Standard Shopify checkout does not strictly enforce complete-ring rules server-side, and adding a stone to a cart does not reserve it.

No live theme publication or Milestone 2 is authorized by these checks. Milestone 2 requires the user's explicit approval after reviewing this pilot.

Subsequent explicit user approval authorized Milestone 2 implementation on this
development pilot. Its separate [implementation and acceptance record](milestone-2.md)
includes merchant publishing/rollback and actual test order #1003. The Milestone 1
evidence above remains a historical record; live-theme publication remains separate.
