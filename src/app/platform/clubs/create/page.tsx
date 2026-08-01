import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PendingClubFields } from "./PendingClubFields";

export default function PlatformCreatePendingClubPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-8 md:py-12">
      <Link
        href="/platform/clubs"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Clubes
      </Link>

      <h1 className="text-xl font-bold text-white mb-1">Crear club</h1>
      <p className="text-sm text-brand-muted mb-8">
        Prepara un club antes de entregárselo a su propietario definitivo (ver &quot;Entrega del club&quot; en el
        detalle del club una vez creado).
      </p>

      <PendingClubFields />
    </div>
  );
}
