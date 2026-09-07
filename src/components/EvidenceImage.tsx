"use client";

import { useEffect, useRef, useState } from "react";
import type { InspectionDiagnosis } from "@/lib/analysis-schema";
import { containImage } from "@/lib/evidence";

type Props = {
  src: string;
  alt: string;
  markers: InspectionDiagnosis["visual_indicators"];
};

/** Boxes share the uncropped image plane, including on portrait phone screens. */
export default function EvidenceImage({ src, alt, markers }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ src: "", width: 1, height: 1 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const size = containImage(area.width, area.height, natural.width, natural.height);
  return (
    <div ref={container} className="evidence-image-frame">
      <div className="evidence-image-plane" style={size}>
        <img src={src} alt={alt} onLoad={event => {
          const img = event.currentTarget;
          setNatural({ src, width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
        }} />
        {natural.src === src && markers.map((marker, index) => (
          <div key={`${marker.label}-${index}`} className="evidence-marker" style={{
            left: `${marker.x}%`, top: `${marker.y}%`,
            width: `${marker.width}%`, height: `${marker.height}%`,
          }}><span>{marker.label}</span></div>
        ))}
      </div>
    </div>
  );
}
