import type { HTMLAttributes, ReactNode } from "react";

type Variant = "light" | "dark" | "solid-white" | "on-blue";

const variants: Record<Variant, string> = {
  light: "glass-light text-white",
  dark: "glass-dark text-white",
  "solid-white": "bg-white text-ink shadow-[var(--shadow-float)]",
  "on-blue": "glass-on-blue text-white",
};

export function GlassCard({
  variant = "light",
  radius = 28,
  className = "",
  style,
  children,
  ...rest
}: { variant?: Variant; radius?: number; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`squircle ${variants[variant]} ${className}`} style={{ borderRadius: radius, ...style }} {...rest}>
      {children}
    </div>
  );
}
