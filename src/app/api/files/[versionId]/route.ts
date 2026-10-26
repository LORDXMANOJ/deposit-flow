import { NextResponse } from "next/server";
import { getUser, toActor } from "@/lib/auth";
import { one } from "@/lib/db";
import { can, isScoped } from "@/lib/rbac";
import { readFile, verifyFileToken } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Private document access (demo equivalent of an authorization-checked signed URL).
 * Requires: a session, document.read permission, institution scope, and a valid short-lived token
 * that was minted for this user and this file version.
 */
export async function GET(req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  const u = await getUser();
  if (!u) return new NextResponse("Sign in required", { status: 401 });
  if (!can(u.role, "document.read")) return new NextResponse("Forbidden", { status: 403 });
  const token = new URL(req.url).searchParams.get("token");
  if (!verifyFileToken(token, versionId, u.id)) return new NextResponse("Link expired or invalid. Reopen the document from the app.", { status: 403 });
  const v = await one<{ storage_key: string; mime: string; original_name: string; institution_id: string; document_id: string }>(
    `select v.storage_key, v.mime, v.original_name, d.institution_id, d.id as document_id
     from document_versions v join documents d on d.id = v.document_id where v.id = $1`, [versionId]);
  if (!v) return new NextResponse("Not found", { status: 404 });
  if (isScoped(u.role) && v.institution_id !== u.institutionId) return new NextResponse("Forbidden", { status: 403 });
  const buf = readFile(v.storage_key);
  await audit(toActor(u), "document.viewed", "document", v.document_id, v.original_name, { versionId });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": v.mime,
      "Content-Disposition": `inline; filename="${v.original_name.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
