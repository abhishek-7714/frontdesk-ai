/** An image squircle that sits inside a line of display text, like the heart in frame 01. */
export function InlinePillImage({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <span
      className="squircle relative mx-[0.06em] inline-block overflow-hidden align-middle"
      style={{ height: "0.82em", width: "1em", borderRadius: "0.22em", transform: "translateY(-0.06em)", boxShadow: "0 0.08em 0.3em -0.1em rgba(0,0,0,0.5)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.18)]" />
    </span>
  );
}
