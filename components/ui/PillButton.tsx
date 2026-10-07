import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "glass" | "solid" | "white" | "danger";

const variants: Record<Variant, string> = {
  glass: "glass-light text-white hover:bg-white/20",
  solid: "bg-periwinkle text-white hover:bg-periwinkle-600",
  white: "bg-white text-periwinkle-600 hover:bg-white/90 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]",
  danger: "bg-danger text-white hover:brightness-110",
};

export function PillButton({
  variant = "glass",
  className = "",
  children,
  ...rest
}: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-7 text-[17px] font-medium tracking-[-0.01em] transition-[background,transform,filter] duration-300 ease-[var(--ease-out-expo)] active:scale-[0.98] disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
