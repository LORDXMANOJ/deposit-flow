"use client";

import { Printer } from "lucide-react";

/** Printable report view: the browser print dialog also offers "Save as PDF". */
export function PrintButton() {
  return <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={14} /> Print or save PDF</button>;
}
