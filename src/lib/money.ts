/**
 * Money helpers. Authoritative amounts are Postgres NUMERIC(16,2) and travel as strings.
 * All arithmetic is done in integer paise with BigInt, never with floating point.
 */

const AMOUNT_RE = /^\d{1,14}(\.\d{1,2})?$/;

export function isValidAmount(v: string): boolean {
  return AMOUNT_RE.test(v.trim());
}

export function toPaise(v: string | number | null | undefined): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  const s = String(v).trim();
  if (!AMOUNT_RE.test(s)) throw new Error(`Invalid amount: ${s}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

export function fromPaise(p: bigint): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function sumAmounts(values: Array<string | null | undefined>): string {
  return fromPaise(values.reduce<bigint>((a, v) => a + toPaise(v), 0n));
}

/** Indian digit grouping (lakh / crore) without touching floats: 12345678.5 -> 1,23,45,678.50 */
export function formatINR(v: string | number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const p = toPaise(v);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  let grouped: string;
  if (whole.length <= 3) grouped = whole;
  else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  const showDecimals = opts.decimals ?? true;
  return `${neg ? "-" : ""}₹${grouped}${showDecimals ? "." + frac : ""}`;
}

/** Compact form for KPI tiles: ₹12.40 Cr, ₹3.25 L, ₹48,500. Display only. */
export function formatINRCompact(v: string | number | null | undefined): string {
  const p = toPaise(v);
  const rupees = p / 100n;
  const crore = 10000000n;
  const lakh = 100000n;
  const two = (num: bigint, unit: bigint) => {
    const hundredths = (num * 100n) / unit; // truncates; display only
    const w = hundredths / 100n;
    const f = (hundredths % 100n).toString().padStart(2, "0");
    return `${w}.${f}`;
  };
  if (rupees >= crore) return `₹${two(rupees, crore)} Cr`;
  if (rupees >= lakh) return `₹${two(rupees, lakh)} L`;
  return formatINR(v, { decimals: false });
}
