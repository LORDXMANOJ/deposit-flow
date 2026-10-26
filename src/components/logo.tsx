/** "Ledger D": a D built from three register rows. The last row carries the accent. See design-system/logo. */
export function LogoMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={className} aria-hidden>
      <path fill="currentColor" d="M42 44H130A84 84 0 0 1 203.86 88H42Z" />
      <path fill="currentColor" d="M42 106H211.07A84 84 0 0 1 211.07 150H42Z" />
      <path fill="var(--accent)" d="M42 168H203.86A84 84 0 0 1 130 212H42Z" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[0.98rem] font-semibold tracking-[-0.02em]">DepositFlow</span>
    </span>
  );
}
