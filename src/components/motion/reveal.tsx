"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

interface RevealProps {
  as?: ElementType;
  /** Stagger in ms. */
  delay?: number;
  className?: string;
  children: ReactNode;
  /** Only mark visible; don't fade the element itself (for containers whose hairlines draw in). */
  linesOnly?: boolean;
  id?: string;
}

/** Fades and lifts content in once as it enters view; children with data-draw-line draw left → right. */
export function Reveal({ as: Tag = "div", delay = 0, className, children, linesOnly = false, id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={className}
      data-reveal={linesOnly ? undefined : ""}
      data-visible={visible}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
