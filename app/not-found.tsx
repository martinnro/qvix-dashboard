import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-7xl font-bold text-slate-700">404</p>
        <h1 className="text-xl font-semibold text-slate-300">Página no encontrada</h1>
        <p className="text-slate-500 text-sm">La ruta que buscás no existe.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mt-2"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
