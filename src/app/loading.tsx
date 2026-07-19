export default function Loading() {
  return (
    <div className="shell">
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div className="spin" style={{
          display: "inline-block",
          width: 32,
          height: 32,
          border: "3px solid var(--line)",
          borderTopColor: "var(--green)",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
        }} />
        <p className="muted" style={{ marginTop: 16 }}>Cargando inspector...</p>
      </div>
    </div>
  );
}
