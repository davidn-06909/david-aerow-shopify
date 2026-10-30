# The Lumen visual pilot assets

These GLBs are generated from `shared/geometry.ts` by `npm run models`. Their source is editable TypeScript, with no downloaded CAD or external texture dependency.

The shapes, stone dimensions, ring-size formula, basket and engraving region are **reference-proportioned visual approximations**. They are not manufacturing CAD and have not been checked against a manufacturer's stone-fitting specifications. `physicalFitVerified` is always false in the asset metadata.

The `Band` mesh is replaced independently when the visual ring size changes. The viewer keeps the head and center stone separate, applies one of four metal materials, and uses a labelled illustrative carat scale for the center stone. Round and Oval GLBs load on demand. Gemstone transmission and dispersion are assigned by the viewer; the GLB's base PBR materials are a compatibility fallback.

Version `lumen-visual-v2` lofts the polished shank continuously into the shoulders, replacing the visible tube joint in version 1. Version 1 GLBs remain available for historical references.

`manifest.json` records asset version, file names, sizes, reference size and illustrative stone profiles. Publish the GLBs and manifest together. Set `assetBaseUrl` to the directory containing them; the local development value is `/models`.

Change the asset version before publishing a geometry change for an installed store with saved designs. Keep prior asset versions available so order and saved-design references remain traceable.
