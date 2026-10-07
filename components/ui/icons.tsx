import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20, props: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const PhoneIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);
export const PhoneOffIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 12.6c4.7-4.4 12.3-4.4 17 0l-1.9 2.6-3.4-1.2-.4-2.5a10 10 0 0 0-5.6 0l-.4 2.5-3.4 1.2-1.9-2.6Z" />
  </svg>
);
export const MicIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
export const MicOffIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M15 9.5V6a3 3 0 0 0-5.8-1M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.8 4.9M18.5 11c0 .7-.1 1.4-.3 2M12 17.5V21M4 4l16 16" />
  </svg>
);
export const DocIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4M9 12h6M9 16h4" />
  </svg>
);
export const CheckIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </svg>
);
export const CalendarIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const AlertIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4.5M12 17.3v.2" />
  </svg>
);
export const SparkIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7Z" />
  </svg>
);
export const ClockIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const ChevronDownIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m7 10 5 5 5-5" />
  </svg>
);
export const BarsIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7 17V11M12 17V7M17 17v-4" />
  </svg>
);
export const RefreshIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5" />
  </svg>
);
export const ArrowRightIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ScreenIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
    <path d="M9 20h6M12 16.5V20" />
  </svg>
);

/** Sprout mark: two leaves on a stem, echoing the reference logo without copying it. */
export const LeafMark = ({ size = 28, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden {...p}>
    <path d="M16 28V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 17c-6.5 0-10-3.8-10-10 6.5 0 10 3.8 10 10Z" fill="currentColor" />
    <path d="M16 14.5c0-6.2 3.6-10 10-10 0 6.2-3.6 10-10 10Z" fill="currentColor" opacity=".85" />
    <path d="M9 28.5c2-1.2 4.4-1.8 7-1.8s5 .6 7 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
  </svg>
);
