"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error", error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main style={{ padding: "40px 20px", maxWidth: 760, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
          <p style={{ color: "#42d392", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: "0.8rem" }}>
            BuildScan AI
          </p>
          <h1 style={{ fontSize: "2rem", color: "#101820", margin: "8px 0 16px" }}>
            Error inesperado del sistema
          </h1>
          <p style={{ color: "#555", lineHeight: 1.6 }}>
            Ocurrio un error critico. Si el problema continua, contacte soporte o consulte los logs del servidor.
          </p>
          {error.digest && (
            <p style={{ color: "#999", fontSize: "0.8rem", marginTop: 16 }}>
              Codigo: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, padding: "10px 20px", background: "#101820", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
