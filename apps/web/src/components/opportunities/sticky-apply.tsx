"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A phone-only Apply bar that appears once the main Apply button has scrolled out of view, so there is never a
 * second button next to the first. It sits above the tab bar (58px) and never over it.
 */
export function StickyApply({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setShow(!entry?.isIntersecting && entry!.boundingClientRect.top < 0),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);
  return (
    <div
      aria-hidden={show ? undefined : true}
      className={`fixed inset-x-0 bottom-[58px] z-30 border-t border-line bg-surface px-3 py-2 shadow-ambient sm:hidden ${
        show ? "" : "pointer-events-none invisible"
      }`}
    >
      {children}
    </div>
  );
}
