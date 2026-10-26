import { NextResponse } from "next/server";
import { createDeposit } from "@/app/actions/records";

/**
 * #19 JSON API for creating a deposit. Clients send `Idempotency-Key: <uuid>` and reuse it on every
 * retry of the same request; the second call returns the first result (status 200, replayed: true)
 * instead of creating a duplicate. Auth and permissions are the same as the UI (session cookie).
 */
export async function POST(req: Request) {
  const key = req.headers.get("idempotency-key") ?? undefined;
  if (key && !/^[0-9a-f-]{36}$/i.test(key)) return NextResponse.json({ error: "Idempotency-Key must be a UUID" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const res = await createDeposit({ ...body, idempotency_key: key });
  if (!res.ok) {
    const status = /signed out/i.test(res.error) ? 401 : /not permitted|another institution/i.test(res.error) ? 403 : 422;
    return NextResponse.json(res, { status });
  }
  return NextResponse.json(res, { status: res.replayed ? 200 : 201, headers: key ? { "Idempotency-Key": key } : {} });
}
