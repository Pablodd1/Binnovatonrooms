"use client";

export type ShotType = {
  label: string;
  detail: string;
};

type Props = {
  shots: ShotType[];
  capturedCount: number;
};

export default function ShotProgress({ shots, capturedCount }: Props) {
  const activeIndex = Math.min(capturedCount, shots.length - 1);

  return (
    <div className="shot-progress" aria-label="Progreso de fotos">
      {shots.map((shot, i) => {
        const isCaptured = i < capturedCount;
        const isActive = i === activeIndex && !isCaptured;
        return (
          <div
            key={shot.label}
            aria-current={isActive ? "step" : undefined}
            className={`shot-dot ${isCaptured ? "captured" : ""} ${isActive ? "active" : ""}`}
            title={`${shot.label}: ${shot.detail}`}
          >
            <span className="shot-dot-circle" aria-hidden="true">
              {isCaptured ? "✓" : i + 1}
            </span>
            <span className="shot-dot-label">{shot.label}</span>
          </div>
        );
      })}
    </div>
  );
}
