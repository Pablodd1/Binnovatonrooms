import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell">
      <main className="error-state" style={{ textAlign: "center" }}>
        <p className="eyebrow">BuildScan AI</p>
        <h1 style={{ fontSize: "3rem", margin: "8px 0" }}>404</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          La pagina o reporte que busca no existe o fue eliminado.
        </p>
        <Link href="/" style={{ textDecoration: "none" }}>
          <button type="button" className="primary">Volver al inspector</button>
        </Link>
      </main>
    </div>
  );
}
