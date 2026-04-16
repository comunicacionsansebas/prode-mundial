"use client";

import { useState } from "react";

type LogoProps = {
  size?: "normal" | "large";
};

export function Logo({ size = "normal" }: LogoProps) {
  const [source, setSource] = useState<"/logo.png" | "/logo.svg" | null>("/logo.png");
  const className = size === "large" ? "brand-mark hero-logo" : "brand-mark";

  return (
    <div className={className} aria-label="Logo empresa">
      {source ? (
        <img
          src={source}
          alt="Logo empresa"
          onError={() => setSource(source === "/logo.png" ? "/logo.svg" : null)}
        />
      ) : (
        <span className="brand-placeholder">Logo empresa</span>
      )}
    </div>
  );
}
