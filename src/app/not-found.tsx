import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <Link href="/" className="inline-block mb-10">
          <span className="text-3xl font-black tracking-tight text-white">
            Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
            <SearchX className="h-8 w-8 text-brand-primary" strokeWidth={1.5} />
          </div>
        </div>

        {/* 404 badge */}
        <div className="inline-block mb-4">
          <span className="text-6xl font-black text-brand-primary">404</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Página no encontrada
        </h1>
        <p className="text-brand-muted text-sm mb-8">
          La página que buscas no existe o ha sido movida.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 w-full"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
