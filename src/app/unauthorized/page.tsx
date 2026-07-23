import Link from "next/link";
import { Shield } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <Link href="/" className="inline-block mb-10">
          <span className="text-3xl font-black tracking-tight text-white">
            <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Shield className="h-8 w-8 text-red-400" strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Acceso no autorizado
        </h1>
        <p className="text-brand-muted text-sm mb-8">
          No tienes permisos para acceder a esta sección. Si crees que esto es
          un error, contacta al administrador de tu club.
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
