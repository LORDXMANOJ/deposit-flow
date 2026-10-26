"use client";

import { useEffect, useState } from "react";

/** #4 Platform-aware modifier label: ⌘ on Apple platforms, Ctrl elsewhere. */
export function useIsMac(): boolean {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    setMac(/mac|iphone|ipad|ipod/i.test(p));
  }, []);
  return mac;
}

export function modLabel(mac: boolean): string {
  return mac ? "⌘" : "Ctrl";
}

/** Shortcuts never fire while someone is typing in a field. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return false;
}

/** Splits "g d" into keycaps for display. */
export function Keys({ combo, className = "" }: { combo: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      {combo.split(" ").map((k, i) => <kbd key={i}>{k.length === 1 ? k.toUpperCase() : k}</kbd>)}
    </span>
  );
}
