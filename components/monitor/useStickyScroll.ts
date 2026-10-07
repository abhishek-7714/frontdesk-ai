"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NEAR_PX = 80;

/**
 * Keeps a scroll panel pinned to its live edge ("bottom" for a transcript, "top" for a newest-first feed)
 * while the viewer is there, and leaves them alone once they scroll away to read.
 * `unseen` is true when new content arrived off-screen; `jump()` returns to the live edge.
 */
export function useStickyScroll<T extends HTMLElement>(edge: "top" | "bottom", contentKey: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const fromTop = el.scrollTop;
    const fromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    pinned.current = (edge === "bottom" ? fromBottom : fromTop) < NEAR_PX;
    if (pinned.current) setUnseen(false);
    setAtStart(fromTop < 2);
    setAtEnd(fromBottom < 2);
  }, [edge]);

  const jump = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = ref.current;
      if (!el) return;
      el.scrollTo({ top: edge === "bottom" ? el.scrollHeight : 0, behavior });
      pinned.current = true;
      setUnseen(false);
    },
    [edge],
  );

  // New content: follow it if pinned, otherwise flag it.
  useLayoutEffect(() => {
    if (pinned.current) jump("smooth");
    else setUnseen(true);
  }, [contentKey, jump]);

  // Cards animate their height in after mount, so re-pin and re-measure while sizes settle.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTo({ top: edge === "bottom" ? el.scrollHeight : 0 });
      measure();
    });
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [edge, measure, contentKey]);

  return { ref, onScroll: measure, unseen, jump, atStart, atEnd };
}
