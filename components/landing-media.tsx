"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./landing-media.module.css";

export type LandingMediaScreenshot = {
  src: string;
  alt?: string;
};

export type LandingMediaProps = {
  /** A short, human-readable description of the visual media. */
  label: string;
  /** Optional longer context for screen readers. */
  description?: string;
  /** A muted, looping product walkthrough. */
  videoSrc?: string;
  /** The first frame shown while the video loads. */
  posterSrc?: string;
  /** Static images used when motion is unavailable or not preferred. */
  fallbackScreenshots?: Array<string | LandingMediaScreenshot>;
  className?: string;
};

function normalizeScreenshots(
  screenshots: LandingMediaProps["fallbackScreenshots"],
  label: string,
): LandingMediaScreenshot[] {
  return (screenshots ?? []).map((screenshot, index) => {
    if (typeof screenshot === "string") {
      return { src: screenshot, alt: index === 0 ? label : "" };
    }

    return {
      ...screenshot,
      alt: index === 0 ? screenshot.alt ?? label : "",
    };
  });
}

export default function LandingMedia({
  label,
  description,
  videoSrc,
  posterSrc,
  fallbackScreenshots,
  className,
}: LandingMediaProps) {
  const [motionPreference, setMotionPreference] = useState<"pending" | "reduce" | "allow">("pending");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setMotionPreference(mediaQuery.matches ? "reduce" : "allow");

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const screenshots = useMemo(() => normalizeScreenshots(fallbackScreenshots, label), [fallbackScreenshots, label]);
  const showVideo = Boolean(videoSrc) && motionPreference === "allow";
  const fallbackImage = screenshots[0] ?? (posterSrc ? { src: posterSrc, alt: label } : undefined);
  const panelClassName = [styles.panel, className].filter(Boolean).join(" ");

  return (
    <figure className={panelClassName} aria-label={label}>
      <div className={styles.chromeBar} aria-hidden="true">
        <div className={styles.trafficLights}>
          <span />
          <span />
          <span />
        </div>
        <span className={styles.chromePath}>OPENASHARE / RESEARCH DESK</span>
        <span className={styles.liveMark}>
          <i /> RESEARCH VIEW
        </span>
      </div>

      <div className={styles.viewport} aria-label={label} role="img">
        <div className={styles.mediaStage}>
          {showVideo ? (
            <video
              className={styles.video}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={posterSrc}
              aria-label={label}
            >
              <source src={videoSrc} />
            </video>
          ) : screenshots.length > 0 ? (
            <div className={styles.screenshotStack}>
              {screenshots.slice(0, 3).map((screenshot, index) => (
                <img
                  key={`${screenshot.src}-${index}`}
                  className={styles.screenshot}
                  src={screenshot.src}
                  alt={screenshot.alt}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ))}
            </div>
          ) : fallbackImage ? (
            <img className={styles.posterFallback} src={fallbackImage.src} alt={fallbackImage.alt} />
          ) : (
            <div className={styles.emptyFallback} aria-hidden="true">
              <span>OPENASHARE</span>
              <strong>Research in motion.</strong>
            </div>
          )}

          <span className={`${styles.signal} ${showVideo ? styles.signalLive : ""}`} aria-hidden="true" />

          <div className={styles.overlayNote} aria-hidden="true">
            <span>MARKET PULSE</span>
          </div>
        </div>
        <div className={styles.statusBar} aria-hidden="true">
          <span>AI RESEARCH WORKSPACE</span>
          <span>{showVideo ? "AUTOPLAY / MUTED" : "STILL FRAME / LOW MOTION"}</span>
        </div>
      </div>

      <figcaption className={styles.srOnly}>{description ?? label}</figcaption>
    </figure>
  );
}
