"use client";

import { useEffect } from "react";
import styles from "./juro-motion.module.css";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function JuroMotionDirector() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-juro-motion-root]");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const storySteps = Array.from(root.querySelectorAll<HTMLElement>("[data-story-step]"));
    const continuitySteps = Array.from(root.querySelectorAll<HTMLElement>("[data-continuity-step]"));
    const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]"));
    const chapterLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-chapter-link]"));
    const storyRail = root.querySelector<HTMLElement>("[data-story-rail]");
    const storySection = storyRail?.closest<HTMLElement>("[data-chapter]") ?? null;
    const continuity = root.querySelector<HTMLElement>("[data-continuity-story]");
    const documentStory = root.querySelector<HTMLElement>("[data-document-story]");
    const handoff = root.querySelector<HTMLElement>("[data-handoff-story]");
    const hero = root.querySelector<HTMLElement>("[data-motion-hero]");
    const footer = root.querySelector<HTMLElement>("footer");

    if (reduceMotion) {
      reveals.forEach((node) => { node.dataset.revealState = "visible"; });
      root.dataset.motionReady = "reduced";
      return;
    }

    const initiallyVisibleReveals = reveals.filter(
      (node) => node.getBoundingClientRect().top < window.innerHeight * .96,
    );
    initiallyVisibleReveals.forEach((node) => { node.dataset.revealState = "visible"; });
    root.dataset.motionReady = "true";

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target as HTMLElement;
          node.dataset.revealState = "visible";
          revealObserver.unobserve(node);
        });
      },
      { rootMargin: "0px 0px -10%", threshold: 0.12 },
    );
    reveals.forEach((node) => revealObserver.observe(node));

    let pointerFrame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (!hero || event.pointerType === "touch") return;
      const rect = hero.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = clamp((event.clientY - rect.top) / rect.height) * 2 - 1;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        hero.style.setProperty("--pointer-x", x.toFixed(3));
        hero.style.setProperty("--pointer-y", y.toFixed(3));
        hero.style.setProperty("--pointer-px", `${((x + 1) / 2) * 100}%`);
        hero.style.setProperty("--pointer-py", `${((y + 1) / 2) * 100}%`);
      });
    };
    hero?.addEventListener("pointermove", onPointerMove, { passive: true });

    let scrollFrame = 0;
    let lastContinuityStep = -1;
    const measureScrollStory = () => {
      const viewport = window.innerHeight;
      const railRect = storyRail?.getBoundingClientRect() ?? null;
      const storyStepCenters = railRect
        ? storySteps.map((step) => {
          const rect = step.getBoundingClientRect();
          return rect.top - railRect.top + rect.height / 2;
        })
        : [];

      return {
        viewport,
        pageRange: Math.max(1, document.documentElement.scrollHeight - viewport),
        scrollY: window.scrollY,
        footerTop: footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        revealTops: reveals.map((node) => node.getBoundingClientRect().top),
        chapterTops: chapters.map((chapter) => chapter.getBoundingClientRect().top),
        storySectionRect: storySection?.getBoundingClientRect() ?? null,
        storyStepCenters,
        documentRect: documentStory?.getBoundingClientRect() ?? null,
        continuityRect: continuity?.getBoundingClientRect() ?? null,
        handoffRect: handoff?.getBoundingClientRect() ?? null,
      };
    };

    const updateScrollStory = () => {
      scrollFrame = 0;
      const measurements = measureScrollStory();
      const { viewport } = measurements;

      root.style.setProperty("--page-progress", String(clamp(measurements.scrollY / measurements.pageRange)));
      root.style.setProperty("--hero-scroll", String(clamp(measurements.scrollY / (viewport * 0.9))));
      root.dataset.footerVisible = measurements.footerTop < viewport * .92 ? "true" : "false";

      reveals.forEach((node, index) => {
        if (node.dataset.revealState !== "visible" && measurements.revealTops[index] < viewport * .96) {
          node.dataset.revealState = "visible";
          revealObserver.unobserve(node);
        }
      });

      if (chapters.length && chapterLinks.length) {
        let activeChapter = 0;
        measurements.chapterTops.forEach((top, index) => {
          if (top <= viewport * .48) activeChapter = index;
        });
        chapterLinks.forEach((link, index) => {
          const active = index === activeChapter;
          link.dataset.active = active ? "true" : "false";
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }

      if (storySteps.length) {
        const sectionRect = measurements.storySectionRect;
        const stickyOffset = Math.min(144, viewport * .14);
        const storyRange = Math.max(1, (sectionRect?.height ?? viewport) - viewport * .72);
        const storyProgress = sectionRect ? clamp((stickyOffset - sectionRect.top) / storyRange) : 0;
        const active = Math.round(storyProgress * (storySteps.length - 1));
        storySteps.forEach((step, index) => {
          step.dataset.active = index === active ? "true" : "false";
          step.dataset.complete = index < active ? "true" : "false";
        });
        const activeStep = storySteps[active];
        if (storyRail && activeStep) {
          const trackStart = measurements.storyStepCenters[0] ?? 0;
          const trackEnd = measurements.storyStepCenters[storySteps.length - 1] ?? trackStart;
          const activeCenter = measurements.storyStepCenters[active] ?? trackStart;
          storyRail.style.setProperty("--story-track-start-px", `${Math.round(trackStart)}px`);
          storyRail.style.setProperty("--story-track-height-px", `${Math.round(trackEnd - trackStart)}px`);
          storyRail.style.setProperty("--story-progress-px", `${Math.round(activeCenter - trackStart)}px`);
        }
      }

      if (documentStory && measurements.documentRect) {
        const rect = measurements.documentRect;
        const progress = clamp((viewport * 0.76 - rect.top) / (rect.height + viewport * 0.34));
        documentStory.style.setProperty("--document-progress", String(progress));
      }

      if (continuity && measurements.continuityRect) {
        const rect = measurements.continuityRect;
        const stickyOffset = Math.min(56, viewport * .06);
        const progress = clamp((stickyOffset - rect.top) / Math.max(1, rect.height - viewport));
        continuity.style.setProperty("--continuity-progress", String(progress));
        const active = Math.round(progress * (continuitySteps.length - 1));
        if (active !== lastContinuityStep) {
          lastContinuityStep = active;
          document.dispatchEvent(new CustomEvent("juro:continuity-step", { detail: active }));
        }
      }

      if (handoff && measurements.handoffRect) {
        const rect = measurements.handoffRect;
        const progress = clamp((viewport * 0.78 - rect.top) / (rect.height + viewport * 0.25));
        handoff.style.setProperty("--handoff-progress", String(progress));
      }
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(updateScrollStory);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = requestAnimationFrame(updateScrollStory);
    });

    return () => {
      revealObserver.disconnect();
      hero?.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(pointerFrame);
      cancelAnimationFrame(scrollFrame);
      delete root.dataset.motionReady;
      delete root.dataset.footerVisible;
    };
  }, []);

  return <div aria-hidden="true" className={styles.pageProgress}><span /></div>;
}
