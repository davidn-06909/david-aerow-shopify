import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response("Preview not found", { status: 404 });
  const design = await prisma.design.findUnique({ where: { id }, select: { previewData: true, previewMime: true } });
  if (!design?.previewData || !["image/png", "image/jpeg"].includes(design.previewMime || "")) return new Response("Preview not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(design.previewData), { headers: { "Content-Type": design.previewMime!, "Content-Length": String(design.previewData.byteLength), "Cache-Control": "public,max-age=31536000,immutable", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
}
