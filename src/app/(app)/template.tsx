/**
 * Re-mounts on every navigation, so each page arrives with a short rise + fade (#9 page transitions).
 * CSS only, under 250 ms, and a pure cross-fade when reduced motion is requested.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
