/**
 * Leaflet Client SDK Loader
 *
 * Dynamically loads Leaflet script and stylesheet safely on client side.
 * Uses local static files (/vendor/leaflet/leaflet.js & leaflet.css)
 * with graceful fallback to CDN if needed.
 */

import type { LeafletType } from "@/types/leaflet";

declare global {
  interface Window {
    L?: LeafletType;
  }
}

let loadPromise: Promise<LeafletType> | null = null;

export function loadLeaflet(): Promise<LeafletType> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet cannot be loaded during server-side rendering"));
  }

  if (window.L && typeof window.L.map === "function") {
    return Promise.resolve(window.L);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<LeafletType>((resolve, reject) => {
    // 1. Inject Leaflet CSS if not already present
    const cssId = "leaflet-stylesheet";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "/vendor/leaflet/leaflet.css";
      link.onerror = () => {
        // Fallback to CDN
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      };
      document.head.appendChild(link);
    }

    // 2. Inject Leaflet Script
    const scriptId = "leaflet-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (existingScript && window.L) {
      resolve(window.L);
      return;
    }

    const script = existingScript || document.createElement("script");
    script.id = scriptId;
    script.src = "/vendor/leaflet/leaflet.js";
    script.async = true;

    script.onload = () => {
      if (window.L && typeof window.L.map === "function") {
        resolve(window.L);
      } else {
        reject(new Error("Leaflet SDK failed to initialize window.L"));
      }
    };

    script.onerror = () => {
      // Fallback script from CDN
      const fallback = document.createElement("script");
      fallback.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      fallback.async = true;
      fallback.onload = () => {
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet CDN fallback failed"));
      };
      fallback.onerror = () => reject(new Error("Failed to load Leaflet script from all sources"));
      document.body.appendChild(fallback);
    };

    if (!existingScript) {
      document.body.appendChild(script);
    }
  });

  return loadPromise;
}
