export function LiveDot({ color = "#3FBF8F", size = 8, pulse = true }: { color?: string; size?: number; pulse?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {pulse && (
        <span className="absolute inset-0 rounded-full" style={{ background: color, animation: "fd-pulse-ring 1.8s var(--ease-out-expo) infinite" }} />
      )}
      <span className="relative rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  );
}
