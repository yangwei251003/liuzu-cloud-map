"use client";

import { useEffect } from "react";

type FounderFontConfig = {
  p: string;
  fonts: Array<{ fontName: string; selecters: string[] }>;
};

type FounderFontConstructor = new (config: FounderFontConfig) => unknown;

declare global {
  interface Window {
    FTFont?: FounderFontConstructor;
  }
}

const FOUNDER_CLOUD_SCRIPT = "https://cdn1.foundertype.com/webfont/js/ftfont-init.js";

export default function FounderCloudFonts() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_FOUNDER_CLOUD_KEY?.trim();
    if (!key) return;

    const config: FounderFontConfig = {
      p: key,
      fonts: [
        { fontName: "FZXKJW", selecters: [".founder-cloud-xingkai"] },
        { fontName: "FZQKBYSJW", selecters: [".founder-cloud-qingke"] },
      ],
    };

    const applyFonts = () => {
      if (typeof window.FTFont !== "function") return;
      try {
        new window.FTFont(config);
      } catch {
        // A missing/expired cloud authorization must keep local fallbacks intact.
      }
    };

    if (typeof window.FTFont === "function") {
      applyFonts();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-founder-cloud-fonts]");
    if (existing) {
      existing.addEventListener("load", applyFonts, { once: true });
      return () => existing.removeEventListener("load", applyFonts);
    }

    const script = document.createElement("script");
    script.src = FOUNDER_CLOUD_SCRIPT;
    script.async = true;
    script.dataset.founderCloudFonts = "true";
    script.addEventListener("load", applyFonts, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener("load", applyFonts);
  }, []);

  return null;
}
