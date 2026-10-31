import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { assetFiles } from '../../shared/assets';
const publicModels = new Set([...assetFiles, 'manifest.json', 'asset-report.json']);
export async function loader({ request, params }: LoaderFunctionArgs) {
  const filename = params.filename || "";
  if (!publicModels.has(filename)) return new Response("Model not found", { status: 404 });
  try {
    const contents = await readFile(resolve("public/models", filename));
    return new Response(request.method === "HEAD" ? null : new Uint8Array(contents), { headers: { "Content-Type": filename.endsWith(".glb") ? "model/gltf-binary" : "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": filename === "manifest.json" ? "public,max-age=300" : "public,max-age=31536000,immutable", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Model not found", { status: 404 }); }
}
