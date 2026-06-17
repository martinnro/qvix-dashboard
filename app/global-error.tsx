"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-7xl font-bold text-slate-700">500</p>
          <h1 className="text-xl font-semibold text-slate-300">Algo salió mal</h1>
          <p className="text-slate-500 text-sm">Ocurrió un error inesperado en el servidor.</p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
