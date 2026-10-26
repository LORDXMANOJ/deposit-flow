import "server-only";
import { signingSecret } from "./secret";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./db";

/**
 * Private file store for demo mode (local disk, never served statically).
 * Files are only reachable through /api/files/[versionId], which checks the session,
 * the role and institution scope, and requires a short-lived HMAC-signed token.
 */

const FILE_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "files");

export const ALLOWED_TYPES: Record<string, { ext: string; label: string }> = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/png": { ext: "png", label: "PNG" },
};

/** Server-side type detection from magic bytes. The filename extension and client MIME are ignored. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function saveFile(buf: Buffer, ext: string): string {
  fs.mkdirSync(FILE_DIR, { recursive: true });
  const key = `${crypto.randomUUID()}.${ext}`; // safe generated identifier, no user input
  fs.writeFileSync(path.join(FILE_DIR, key), buf);
  return key;
}

export function readFile(key: string): Buffer {
  if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(key)) throw new Error("Invalid storage key");
  return fs.readFileSync(path.join(FILE_DIR, key));
}


/** Short-lived signed token (the demo equivalent of a signed URL). */
export function signFileToken(versionId: string, userId: string, ttlSeconds = 120): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${versionId}.${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyFileToken(token: string | null, versionId: string, userId: string): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expect = crypto.createHmac("sha256", signingSecret()).update(`${versionId}.${userId}.${exp}`).digest("base64url");
  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Minimal valid one-page PDF so seeded documents open in a viewer. Clearly marked synthetic. */
export function makeDemoPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const content = ["BT /F1 14 Tf 56 760 Td 18 TL", ...lines.map((l, i) => `${i ? "T* " : ""}(${esc(l)}) Tj`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => (out += `${String(off).padStart(10, "0")} 00000 n \n`));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
