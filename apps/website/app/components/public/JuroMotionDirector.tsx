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

    reveals.forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight * .96) node.dataset.revealState = "visible";
    });
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
    let lastClause = -1;
    const updateScrollStory = () => {
      scrollFrame = 0;
      const viewport = window.innerHeight;
      const pageRange = Math.max(1, document.documentElement.scrollHeight - viewport);
      root.style.setProperty("--page-progress", String(clamp(window.scrollY / pageRange)));
      root.style.setProperty("--hero-scroll", String(clamp(window.scrollY / (viewport * 0.9))));
      root.dataset.footerVisible = footer && footer.getBoundingClientRect().top < viewport * .92 ? "true" : "false";

      reveals.forEach((node) => {
        if (node.dataset.revealState !== "visible" && node.getBoundingClientRect().top < viewport * .96) {
          node.dataset.revealState = "visible";
          revealObserver.unobserve(node);
        }
      });

      if (chapters.length && chapterLinks.length) {
        let activeChapter = 0;
        chapters.forEach((chapter, index) => {
          if (chapter.getBoundingClientRect().top <= viewport * .48) activeChapter = index;
        });
        chapterLinks.forEach((link, index) => {
          const active = index === activeChapter;
          link.dataset.active = active ? "true" : "false";
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }

      if (storySteps.length) {
        const target = viewport * 0.48;
        let active = 0;
        let distance = Number.POSITIVE_INFINITY;
        storySteps.forEach((step, index) => {
          const rect = step.getBoundingClientRect();
          const current = Math.abs(rect.top + rect.height / 2 - target);
          if (current < distance) {
            active = index;
            distance = current;
          }
        });
        storySteps.forEach((step, index) => { step.dataset.active = index === active ? "true" : "false"; });
        storyRail?.style.setProperty("--story-progress", String(active / Math.max(1, storySteps.length - 1)));
      }

      if (documentStory) {
        const rect = documentStory.getBoundingClientRect();
        const progress = clamp((viewport * 0.76 - rect.top) / (rect.height + viewport * 0.34));
        documentStory.style.setProperty("--document-progress", String(progress));
        const clause = Math.min(2, Math.floor(progress * 3));
        if (clause !== lastClause) {
          lastClause = clause;
          document.dispatchEvent(new CustomEvent("juro:document-step", { detail: clause }));
        }
      }

      if (continuity) {
        const rect = continuity.getBoundingClientRect();
        const progress = clamp((viewport * 0.74 - rect.top) / (rect.height + viewport * 0.3));
        continuity.style.setProperty("--continuity-progress", String(progress));
        const active = Math.min(continuitySteps.length - 1, Math.floor(progress * continuitySteps.length));
        continuitySteps.forEach((step, index) => {
          if (index <= active) step.setAttribute("data-active", "true");
          else step.removeAttribute("data-active");
        });
      }

      if (handoff) {
        const rect = handoff.getBoundingClientRect();
        const progress = clamp((viewport * 0.78 - rect.top) / (rect.height + viewport * 0.25));
        handoff.style.setProperty("--handoff-progress", String(progress));
      }
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(updateScrollStory);
    };
    updateScrollStory();
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
