"use client";

export type ShotType = {
  label: string;
  detail: string;
};

type Props = {
  shots: ShotType[];
  capturedCount: number;
  onSelect?: (index: number) => void;
};

export default function ShotProgress({ shots, capturedCount, onSelect }: Props) {
  const activeIndex = Math.min(capturedCount, shots.length - 1);

  return (
    <div className="shot-progress" role="tablist" aria-label="Progreso de fotos">
      {shots.map((shot, i) => {
        const isCaptured = i < capturedCount;
        const isActive = i === activeIndex && !isCaptured;
        return (
          <button
            key={shot.label}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`shot-dot ${isCaptured ? "captured" : ""} ${isActive ? "active" : ""}`}
            onClick={() => onSelect?.(i)}
            title={`${shot.label}: ${shot.detail}`}
          >
            <span className="shot-dot-circle" aria-hidden="true">
              {isCaptured ? "✓" : i + 1}
            </span>
            <span className="shot-dot-label">{shot.label}</span>
          </button>
        );
      })}
    </div>
  );
}
