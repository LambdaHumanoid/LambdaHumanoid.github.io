"use client";

import { useEffect } from "react";

export function PageTransitions() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    // Grouped, single entrances. Reading content never disappears on scrolling out.
    const nodes = document.querySelectorAll<HTMLElement>(
      ".section-intro, .thesis-grid, .overview-takeaway, .facts, .demo-scene, .modality-columns, .data-note, .pipeline, .deployment-note, .result-highlights, .comparison-heading, .table-scroll, .scaling-findings, .closing, .paper-figure:not(.humanverse-animation):not(.scaling-animation)",
    );
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const node = entry.target as HTMLElement;
        node.classList.remove("reveal-pending");
        if (!preference.matches) {
          const animation = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 850, easing: "ease-out" });
          animations.add(animation);
          void animation.finished.then(() => animations.delete(animation)).catch(() => {});
        }
        observer.unobserve(node);
      });
    }, { threshold: .08 });
    nodes.forEach(node => {
      // Do not hide content that was already visible before hydration.
      if (node.getBoundingClientRect().top > window.innerHeight) {
        node.classList.add("reveal-pending"); observer.observe(node);
      }
    });
    const reveal = () => {
      if (!preference.matches) return;
      nodes.forEach(node => node.classList.remove("reveal-pending"));
      animations.forEach(animation => animation.cancel()); observer.disconnect();
    };
    // Focus must immediately expose any keyboard-accessed content.
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const node = event.target.closest(".reveal-pending");
      if (node) { node.classList.remove("reveal-pending"); observer.unobserve(node); }
    };
    document.addEventListener("focusin", focus); preference.addEventListener("change", reveal);
    return () => {
      observer.disconnect(); nodes.forEach(node => node.classList.remove("reveal-pending"));
      animations.forEach(animation => animation.cancel());
      document.removeEventListener("focusin", focus); preference.removeEventListener("change", reveal);
    };
  }, []);
  return null;
}
