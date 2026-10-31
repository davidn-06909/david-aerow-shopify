# Shopify development checkout evidence

Verified through Shopify Admin API and the app's PostgreSQL records at
**30 October 2026, 22:12:47 UTC**. This was a Shopify **test order**, not a charged
customer purchase.

| Field | Verified result |
| --- | --- |
| Development store | `aerow-qdbfzxwi.myshopify.com` |
| Order | `#1001` / `18980456628472` |
| Shopify test flag | `true` |
| Financial status | `PAID` |
| Total | **USD 5,595.00** |
| Saved design | `c3151760-c9b7-490d-b74e-935c7c1190fa` |
| Cart group | `d271b5e5-128b-4d34-982d-576d97b96b73` |
| Model version | `lumen-visual-v2` |

[Open the order in Shopify Admin](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18980456628472)
requires store access.

The order contains exactly these three component variants, each quantity one:

| Role | Variant | Actual unit price |
| --- | --- | --- |
| The Lumen setting | `67890588942584` | USD 2,450.00 |
| Round 2.00 ct, lab grown | `67890574688504` | USD 3,100.00 |
| Personal engraving service | `67911152632056` | USD 45.00 |

The confirmed selection is Hidden halo / High polish / Platinum / Round /
size 4.5, with engraving `3ertyui`. Every expected manufacturing and grouping
property, signed configuration reference, asset version and preview reference
matches the immutable saved design. The complete signed reference is retained
server-side and is deliberately excluded from this document.

Shopify's actual `orders/create` webhook reached the app at 22:11:06 UTC, passed
the SDK's raw-body authentication, and was processed in one attempt. The stored
order/design association is `verified_paid` with an empty discrepancy list.

The [saved JPEG](https://aevow-ring-pilot.netlify.app/previews/c3151760-c9b7-490d-b74e-935c7c1190fa)
is **28,363 bytes**. Its public resource returned HTTP 200 and
`image/jpeg`, and its bytes exactly matched the database image. SHA-256:

```text
c54cbc9c92ac9992191139a07486396b4569be750440b669db2aa52bf870a4e4
```

Sanitized machine evidence is retained in the ignored local file
`.cache/test-order-proof.json`. Customer identity, address, contact data, payment
details, app credentials and access tokens are excluded from the public proof.
The original order-line preview reference uses the development tunnel. The
record and image were subsequently migrated to the free hosted PostgreSQL
database without copying Shopify session tokens. The stable Netlify image
above returned HTTP 200 with the same byte hash at 22:36:19 UTC, proving the
deployed Linux Prisma runtime can read the migrated image.

Shopify manages the resulting inventory change. The app did not decrement or
restock the diamond itself. The visual model remains representative, with
physical gemstone fitting unverified.

## Hosted checkout on Netlify

A second checkout completed against the deployed Node app and managed
PostgreSQL database. Verified through Shopify Admin API, the cloud database,
and the public image resource at **30 October 2026, 22:43:41 UTC**:

| Field | Verified result |
| --- | --- |
| Order | `#1002` / `18980498178296` |
| Confirmation | `2MTJAE5UA` |
| Shopify test flag / financial status | `true` / `PAID` |
| Total | **USD 5,595.00** |
| Saved design | `752a6741-f23c-4171-9774-b6073010bcd6` |
| Cart group | `405ea7df-c400-4f76-990b-b5371765eead` |
| Production deployment | `6ae51c6e2757e0c2fed84339` |

[Open hosted test order #1002](https://admin.shopify.com/store/aerow-qdbfzxwi/orders/18980498178296)
requires store access.

It contains exactly one Platinum size-4.5 Lumen setting
(`67890588942584`, USD 2,450), one Oval 2.00 ct lab-grown diamond
(`67890574557432`, USD 3,100), and one engraving service
(`67911152632056`, USD 45). Engraving `3ertyui`, signed configuration reference,
group ID, model version `lumen-visual-v2`, and all expected line properties match
the immutable cloud design. Every line carries the stable Netlify preview URL.

The actual cloud `orders/create` receipt was processed once at
**22:42:03 UTC**, with an association status of `verified_paid` and no
discrepancies. Shopify's test flag confirms this was not a charged purchase.

The [hosted Oval preview](https://aevow-ring-pilot.netlify.app/previews/752a6741-f23c-4171-9774-b6073010bcd6)
returned HTTP 200, `image/jpeg`, and **28,743 bytes**, exactly matching the
cloud database. Its SHA-256 is:

```text
0b4a5f354333258cc6e3771b6942a79706c021abf122fb1d5e23e39e8d1fd209
```

Sanitized machine evidence is retained locally in
`.cache/cloud-test-order-proof.json`, with the downloaded image at
`.cache/cloud-order-oval-preview.jpg`. The approved migration excluded Shopify
session tokens; the hosted app obtained its own client-credentials grant.
The original local database remains available as rollback data. Neither
checkout triggered app-side inventory decrements or automatic restocking.
