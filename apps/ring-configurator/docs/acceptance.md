# Milestone 1 acceptance record

The milestone is complete only after real integration and customer acceptance checks below have recorded evidence. Source completion and a local visual preview do not substitute for installation or checkout.

| Check | Evidence/status |
| --- | --- |
| Shopify app registered and installed in development store | Registered and installed in aerow-qdbfzxwi.myshopify.com; real Admin API confirms partner development store |
| PostgreSQL migration applied against provisioned database | Applied to this app's persistent local PostgreSQL 16 cluster; managed production database remains pending |
| Four diamond IDs and all metal/size variants mapped on development store | 44 existing Lumen variants and four exact existing diamonds mapped in config/pilot.mapping.json; no duplicates created |
| Free preview storage and model delivery | PostgreSQL image storage verified byte-for-byte through public HTTPS; versioned GLBs served by app with CORS. R2 is not required or activated |
| Hosted deployment and embedded diagnostics | Real installed app/diagnostics work through the current development tunnel; persistent free hosting remains a separate acceptance item |
| Round/Oval geometry, metal switches, rotation/zoom/reset/views | Local visual acceptance required |
| US size changes leave diamond dimensions unchanged | Automated geometry regression plus local review |
| Seven-character engraving yields 13 remaining; text is retained | Automated server validation plus storefront review |
| Original URL restores Platinum, Round 2ct lab, size 4.5, 3ertyui | Current real Shopify quote and PostgreSQL snapshot verified USD 5,595; storefront journey review recorded separately |
| Shape change clears incompatible stone; Back/Forward restores state | Storefront regression and browser review |
| Double-click, uncertain response and retry do not duplicate components | Cart regression tests plus development-store checkout |
| Existing group edit/removal affects only that group | Cart regression tests plus development-store review |
| Actual Shopify test checkout retains all variants, inscription and references | Pending installed development-store test order |
| Verified/deduplicated order webhook associates exact saved design | Actual SDK HMAC and real PostgreSQL persistence verified with explicit test payloads; real Shopify webhook pending test order |
| Two buyers compete for a one-stock stone | Pending development-store inventory test |
| Rendering at least 30 FPS during rotation | Pending agreed physical midrange phone; record device, OS/browser, duration and FPS |
| Repeated changes/remounts do not continue growing GPU memory | Viewer disposal checks plus browser GPU review |
| App tests/typecheck/build; theme CSS build/theme check | Record final command results in handoff |

## Recorded backend validation

- 35 unit/regression checks pass at this stage, including server compatibility/price validation, Unicode engraving, quote signatures, public-asset path restrictions/CORS, bounded preview images, single-merchant grant isolation, storefront state and geometry.
- Eleven checks passed against a real disposable PostgreSQL 16 instance using the committed migrations: atomic snapshots/preview bytes, concurrent request-id deduplication, tenant isolation, development-store guards and the actual Shopify SDK's webhook authentication/deduplication. Shopify Admin catalog responses in that integration suite are explicit test doubles; no Shopify order was placed by it.
- The real installed Aerow connection returns USD catalog prices and the 44 Lumen variants/four diamond mappings. The user-approved exact setup enabled tracking with one unit and DENY policy on only those four stones, and created/published the missing USD 45 engraving service (variant 67911152632056). No Lumen or diamond duplicates were created. The temporary product/inventory/publication/location permissions were then removed and the refreshed installed grant was verified to contain only product/inventory/order reads and app-proxy access.
- Actual Shopify prices plus the persistent local PostgreSQL database verified the original USD 5,595 configuration and idempotent quote replay. A separate database-backed test preview returned HTTP 200 image/png over the public HTTPS tunnel with byte-for-byte image matching. That storage proof used a small test PNG and did not claim to be a shopper's captured ring or a checkout.
- Connected production paths do not consume the captured reference catalog. That timestamped capture is used only by the explicitly disabled-for-purchase visual preview and test fixtures.
- The editable model output is representative. Repeated certificate numbers in the source catalog have not been independently verified and do not constitute certificate approval.

No live theme publication or Milestone 2 is authorized by these checks. Milestone 2 requires the user's explicit approval after reviewing this pilot.
