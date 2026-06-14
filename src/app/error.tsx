"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error", error);
  }, [error]);

  return (
    <main className="shell">
      <section className="error-state">
        <p className="eyebrow">BuildScan AI</p>
        <h1>No pudimos cargar el inspector.</h1>
        <p className="muted">
          Revise la conexion, refresque la sesion o intente de nuevo. Si el problema continua, verifique las variables
          de entorno y los logs de Vercel.
        </p>
        <button type="button" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
