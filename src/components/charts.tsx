"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Charts follow the dataviz skill: one measure per chart (the title names it, so no legend box),
 * colour assigned by meaning (status tones, urgency) or one hue for magnitude, 4px rounded data ends,
 * recessive grid, values in ink tokens, hover tooltips, and a visually hidden table for screen readers.
 */

export type Datum = { label: string; value: number; display: string; sub?: string; color?: string };

const axisTick = { fill: "var(--ink-3)", fontSize: 11 };

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 shadow-[var(--shadow-pop)] text-[0.78rem]">
      <p className="font-semibold">{d.label}</p>
      <p className="tabular text-ink-2">{d.display}</p>
      {d.sub && <p className="text-ink-3">{d.sub}</p>}
    </div>
  );
}

function SrTable({ data, caption }: { data: Datum[]; caption: string }) {
  return (
    // Wrapped: a <table> ignores the 1px sr-only box and would widen the page on phones.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.display}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function HBar({ data, caption, color = "var(--c1)", height }: { data: Datum[]; caption: string; color?: string; height?: number }) {
  if (!data.length) return <p className="text-sm text-ink-3 py-10 text-center">No data for the current filters.</p>;
  const h = height ?? Math.max(140, data.length * 34 + 16);
  return (
    <div role="img" aria-label={caption}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={150} tick={axisTick} tickLine={false} axisLine={false}
            tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.label} fill={d.color ?? color} />)}
            <LabelList dataKey="display" position="right" offset={6} style={{ fill: "var(--ink-2)", fontSize: 11, fontVariantNumeric: "tabular-nums" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SrTable data={data} caption={caption} />
    </div>
  );
}

export function Columns({ data, caption }: { data: Datum[]; caption: string }) {
  if (!data.length) return <p className="text-sm text-ink-3 py-10 text-center">No maturities in the next 12 months.</p>;
  return (
    <div role="img" aria-label={caption}>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -18 }} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} interval={0} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.label} fill={d.color ?? "var(--c1)"} />)}
            <LabelList dataKey="value" position="top" offset={6} style={{ fill: "var(--ink-3)", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SrTable data={data} caption={caption} />
    </div>
  );
}
