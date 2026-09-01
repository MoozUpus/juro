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
    const updateScrollStory = () => {
      scrollFrame = 0;
      const viewport = window.innerHeight;
      const pageRange = Math.max(1, document.documentElement.scrollHeight - viewport);
      const footerVisible = Boolean(footer && footer.getBoundingClientRect().top < viewport * .92);
      const revealsToShow = reveals.filter(
        (node) => node.dataset.revealState !== "visible" && node.getBoundingClientRect().top < viewport * .96,
      );
      let activeChapter = 0;
      if (chapters.length && chapterLinks.length) {
        chapters.forEach((chapter, index) => {
          if (chapter.getBoundingClientRect().top <= viewport * .48) activeChapter = index;
        });
      }

      let storyState: null | {
        active: number;
        trackStart?: number;
        trackHeight?: number;
        trackProgress?: number;
      } = null;
      if (storySteps.length) {
        const sectionRect = storySection?.getBoundingClientRect();
        const stickyOffset = Math.min(144, viewport * .14);
        const storyRange = Math.max(1, (sectionRect?.height ?? viewport) - viewport * .72);
        const storyProgress = sectionRect ? clamp((stickyOffset - sectionRect.top) / storyRange) : 0;
        const active = Math.round(storyProgress * (storySteps.length - 1));
        const activeStep = storySteps[active];
        if (storyRail && activeStep) {
          const railRect = storyRail.getBoundingClientRect();
          const stepCenter = (step: HTMLElement) => {
            const rect = step.getBoundingClientRect();
            return rect.top - railRect.top + rect.height / 2;
          };
          const trackStart = stepCenter(storySteps[0]);
          const trackEnd = stepCenter(storySteps[storySteps.length - 1]);
          const activeCenter = stepCenter(activeStep);
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

      const documentRect = documentStory?.getBoundingClientRect();
      const documentProgress = documentRect
        ? clamp((viewport * 0.76 - documentRect.top) / (documentRect.height + viewport * 0.34))
        : null;
      const continuityRect = continuity?.getBoundingClientRect();
      const continuityProgress = continuityRect
        ? clamp((Math.min(56, viewport * .06) - continuityRect.top) / Math.max(1, continuityRect.height - viewport))
        : null;
      const continuityActive = continuityProgress === null
        ? null
        : Math.round(continuityProgress * (continuitySteps.length - 1));
      const handoffRect = handoff?.getBoundingClientRect();
      const handoffProgress = handoffRect
        ? clamp((viewport * 0.78 - handoffRect.top) / (handoffRect.height + viewport * 0.25))
        : null;

      // Commit state only after every layout read above, preventing read/write
      // interleaving from forcing repeated synchronous reflows.
      root.dataset.motionReady = "true";
      root.style.setProperty("--page-progress", String(clamp(window.scrollY / pageRange)));
      root.style.setProperty("--hero-scroll", String(clamp(window.scrollY / (viewport * 0.9))));
      root.dataset.footerVisible = footerVisible ? "true" : "false";
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
    // Hydration and stylesheet activation still leave layout dirty inside the
    // mounting task. Waiting through one paint keeps the first geometry pass
    // from forcing a synchronous layout on slower devices.
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = requestAnimationFrame(updateScrollStory);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

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
