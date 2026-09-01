"use client";

import { useEffect } from "react";
import styles from "./juro-motion.module.css";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

type PageBox = {
  height: number;
  top: number;
};

type MotionGeometry = {
  chapterTops: number[];
  continuity: PageBox | null;
  documentStory: PageBox | null;
  handoff: PageBox | null;
  hero: (PageBox & { left: number; width: number }) | null;
  pageRange: number;
  revealTops: number[];
  storySection: PageBox | null;
  storyStepCenters: number[];
  viewport: number;
};

const emptyGeometry = (): MotionGeometry => ({
  chapterTops: [],
  continuity: null,
  documentStory: null,
  handoff: null,
  hero: null,
  pageRange: 1,
  revealTops: [],
  storySection: null,
  storyStepCenters: [],
  viewport: 1,
});

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

    const footerObserver = footer
      ? new IntersectionObserver(
        ([entry]) => {
          root.dataset.footerVisible = entry?.isIntersecting ? "true" : "false";
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0 },
      )
      : null;
    if (footer) footerObserver?.observe(footer);

    let geometry = emptyGeometry();
    let measureFrame = 0;
    let disposed = false;

    const pageBox = (node: HTMLElement | null, scrollY: number): PageBox | null => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { height: rect.height, top: rect.top + scrollY };
    };

    const refreshGeometry = () => {
      measureFrame = 0;
      const viewport = window.innerHeight;
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const railRect = storyRail?.getBoundingClientRect() ?? null;
      const heroRect = hero?.getBoundingClientRect() ?? null;

      geometry = {
        chapterTops: chapters.map((chapter) => chapter.getBoundingClientRect().top + scrollY),
        continuity: pageBox(continuity, scrollY),
        documentStory: pageBox(documentStory, scrollY),
        handoff: pageBox(handoff, scrollY),
        hero: heroRect
          ? {
            height: Math.max(1, heroRect.height),
            left: heroRect.left + scrollX,
            top: heroRect.top + scrollY,
            width: Math.max(1, heroRect.width),
          }
          : null,
        pageRange: Math.max(1, document.documentElement.scrollHeight - viewport),
        revealTops: reveals.map((node) => node.getBoundingClientRect().top + scrollY),
        storySection: pageBox(storySection, scrollY),
        storyStepCenters: railRect
          ? storySteps.map((step) => {
            const rect = step.getBoundingClientRect();
            return rect.top - railRect.top + rect.height / 2;
          })
          : [],
        viewport,
      };
    };

    let pointerFrame = 0;
    const onPointerMove = (event: PointerEvent) => {
      const heroGeometry = geometry.hero;
      if (!hero || !heroGeometry || event.pointerType === "touch") return;
      const x = clamp((event.clientX + window.scrollX - heroGeometry.left) / heroGeometry.width) * 2 - 1;
      const y = clamp((event.clientY + window.scrollY - heroGeometry.top) / heroGeometry.height) * 2 - 1;
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
    const updateScrollStory = () => {
      scrollFrame = 0;
      const { viewport } = geometry;
      const scrollY = window.scrollY;
      const revealsToShow = reveals.filter(
        (node, index) => node.dataset.revealState !== "visible"
          && (geometry.revealTops[index] ?? Number.POSITIVE_INFINITY) - scrollY < viewport * .96,
      );
      let activeChapter = 0;
      if (chapters.length && chapterLinks.length) {
        geometry.chapterTops.forEach((top, index) => {
          if (top - scrollY <= viewport * .48) activeChapter = index;
        });
      }

      let storyState: null | {
        active: number;
        trackStart?: number;
        trackHeight?: number;
        trackProgress?: number;
      } = null;
      if (storySteps.length) {
        const section = geometry.storySection;
        const stickyOffset = Math.min(144, viewport * .14);
        const storyRange = Math.max(1, (section?.height ?? viewport) - viewport * .72);
        const storyProgress = section ? clamp((stickyOffset - (section.top - scrollY)) / storyRange) : 0;
        const active = Math.round(storyProgress * (storySteps.length - 1));
        const trackStart = geometry.storyStepCenters[0];
        const trackEnd = geometry.storyStepCenters[storySteps.length - 1];
        const activeCenter = geometry.storyStepCenters[active];
        if (
          storyRail
          && trackStart !== undefined
          && trackEnd !== undefined
          && activeCenter !== undefined
        ) {
          storyState = {
            active,
            trackStart,
            trackHeight: trackEnd - trackStart,
            trackProgress: activeCenter - trackStart,
          };
        } else {
          storyState = { active };
        }
      }

      const documentProgress = geometry.documentStory
        ? clamp(
          (viewport * 0.76 - (geometry.documentStory.top - scrollY))
            / (geometry.documentStory.height + viewport * 0.34),
        )
        : null;
      const continuityProgress = geometry.continuity
        ? clamp(
          (Math.min(56, viewport * .06) - (geometry.continuity.top - scrollY))
            / Math.max(1, geometry.continuity.height - viewport),
        )
        : null;
      const continuityActive = continuityProgress === null
        ? null
        : Math.round(continuityProgress * (continuitySteps.length - 1));
      const handoffProgress = geometry.handoff
        ? clamp(
          (viewport * 0.78 - (geometry.handoff.top - scrollY))
            / (geometry.handoff.height + viewport * 0.25),
        )
        : null;

      root.style.setProperty("--page-progress", String(clamp(scrollY / geometry.pageRange)));
      root.style.setProperty("--hero-scroll", String(clamp(scrollY / (viewport * 0.9))));
      revealsToShow.forEach((node) => {
        node.dataset.revealState = "visible";
        revealObserver.unobserve(node);
      });
      if (chapters.length && chapterLinks.length) {
        chapterLinks.forEach((link, index) => {
          const active = index === activeChapter;
          link.dataset.active = active ? "true" : "false";
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
      if (storyState) {
        storySteps.forEach((step, index) => {
          step.dataset.active = index === storyState.active ? "true" : "false";
          step.dataset.complete = index < storyState.active ? "true" : "false";
        });
        if (
          storyRail
          && storyState.trackStart !== undefined
          && storyState.trackHeight !== undefined
          && storyState.trackProgress !== undefined
        ) {
          storyRail.style.setProperty("--story-track-start-px", `${Math.round(storyState.trackStart)}px`);
          storyRail.style.setProperty("--story-track-height-px", `${Math.round(storyState.trackHeight)}px`);
          storyRail.style.setProperty("--story-progress-px", `${Math.round(storyState.trackProgress)}px`);
        }
      }
      if (documentStory && documentProgress !== null) {
        documentStory.style.setProperty("--document-progress", String(documentProgress));
      }
      if (continuity && continuityProgress !== null) {
        continuity.style.setProperty("--continuity-progress", String(continuityProgress));
      }
      if (continuityActive !== null && continuityActive !== lastContinuityStep) {
        lastContinuityStep = continuityActive;
        document.dispatchEvent(new CustomEvent("juro:continuity-step", { detail: continuityActive }));
      }
      if (handoff && handoffProgress !== null) {
        handoff.style.setProperty("--handoff-progress", String(handoffProgress));
      }
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(updateScrollStory);
    };
    const scheduleMeasure = () => {
      if (disposed || measureFrame) return;
      measureFrame = requestAnimationFrame(() => {
        if (disposed) return;
        refreshGeometry();
        updateScrollStory();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(root);

    refreshGeometry();
    root.dataset.motionReady = "true";
    updateScrollStory();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    void document.fonts.ready.then(scheduleMeasure);

    return () => {
      disposed = true;
      revealObserver.disconnect();
      footerObserver?.disconnect();
      resizeObserver.disconnect();
      hero?.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleMeasure);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(pointerFrame);
      cancelAnimationFrame(scrollFrame);
      delete root.dataset.motionReady;
      delete root.dataset.footerVisible;
    };
  }, []);

  return <div aria-hidden="true" className={styles.pageProgress}><span /></div>;
}
