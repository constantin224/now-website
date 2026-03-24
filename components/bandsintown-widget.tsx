"use client";

import { useEffect, useRef, useState } from "react";

// Bandsintown Artist: Now., ID 3443904

export default function BandsintownWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || initialized.current) return;
    initialized.current = true;

    // Anchor-Element für das Widget
    const anchor = document.createElement("a");
    anchor.className = "bit-widget-initializer";
    anchor.setAttribute("data-artist-name", "id_3443904");
    anchor.setAttribute("data-display-local-dates", "false");
    anchor.setAttribute("data-display-past-dates", "true");
    anchor.setAttribute("data-auto-style", "false");
    anchor.setAttribute("data-text-color", "rgba(212, 203, 190, 0.7)");
    anchor.setAttribute("data-link-color", "rgba(160, 115, 82, 1)");
    anchor.setAttribute("data-background-color", "rgba(0, 0, 0, 0)");
    anchor.setAttribute("data-separator-color", "rgba(160, 115, 82, 0.12)");
    anchor.setAttribute("data-font", "system-ui, -apple-system, sans-serif");
    anchor.setAttribute("data-display-limit", "20");
    anchor.setAttribute("data-link-text-color", "rgba(160, 115, 82, 1)");
    anchor.setAttribute("data-popup-background-color", "rgba(22, 18, 16, 0.98)");
    anchor.setAttribute("data-display-start-time", "false");
    container.appendChild(anchor);

    // Widget-Script laden
    const script = document.createElement("script");
    script.src = "https://widget.bandsintown.com/main.min.js";
    script.charset = "utf-8";
    script.async = true;
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);

    // Timeout: wenn nach 8s nichts gerendert → Fallback zeigen
    const timeout = setTimeout(() => {
      const hasContent = container.querySelector("iframe, .bit-events, .bit-widget, div[class*='bit']");
      if (!hasContent) setFailed(true);
    }, 8000);

    // Widget restylen + "Request a Show" verstecken
    const restyle = setInterval(() => {
      container.querySelectorAll("a, div, button, span").forEach((el) => {
        const html = el as HTMLElement;
        const bg = getComputedStyle(html).backgroundColor;
        const text = html.textContent?.toLowerCase().trim() || "";

        // "Request a Show" Link verstecken (nur exakter Match)
        if (text === "request a show" || text === "request a show →") {
          html.style.display = "none";
        }

        // Den großen farbigen Track-Button finden und restylen
        if (
          bg &&
          !bg.includes("0, 0, 0") &&
          !bg.includes("rgba(0") &&
          html.offsetHeight > 30 &&
          html.offsetHeight < 80 &&
          (text.includes("track") || html.children.length === 0)
        ) {
          html.style.background = "rgba(160, 115, 82, 0.1)";
          html.style.border = "1px solid rgba(160, 115, 82, 0.2)";
          html.style.borderRadius = "9999px";
          html.style.color = "rgba(160, 115, 82, 1)";
          html.style.fontSize = "9px";
          html.style.letterSpacing = "2px";
          html.style.textTransform = "uppercase";
          html.style.height = "auto";
          html.style.padding = "10px 20px";
          html.style.maxWidth = "200px";
          html.style.margin = "1.5rem auto 0";
          html.style.display = "block";
          html.style.textAlign = "center";
        }
      });

      // Auch im iframe versuchen (falls same-origin)
      container.querySelectorAll("iframe").forEach((iframe) => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return;
          doc.querySelectorAll("a, div, button, span").forEach((el) => {
            const html = el as HTMLElement;
            const text = html.textContent?.toLowerCase().trim() || "";
            if (text === "request a show" || text === "request a show →") {
              html.style.display = "none";
            }
          });
        } catch { /* cross-origin, ignorieren */ }
      });
    }, 1000);

    const stopRestyle = setTimeout(() => clearInterval(restyle), 15000);

    return () => {
      clearTimeout(timeout);
      clearInterval(restyle);
      clearTimeout(stopRestyle);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className={`min-h-[100px] ${failed ? "hidden" : ""}`} />
      {failed && (
        <div className="text-center py-12">
          <a
            href="https://www.bandsintown.com/a/3443904-now."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] tracking-[2px] uppercase px-6 py-3 rounded-full hover:bg-terracotta/20 transition-colors"
          >
            Shows auf Bandsintown ansehen
          </a>
        </div>
      )}
    </>
  );
}
