import type { Metadata } from "next";
import { DemoForm } from "./DemoForm";

export const metadata: Metadata = {
  title: "Solicita una demo | Mi Pádel Club",
  description:
    "Cuéntanos sobre tu club y coordinamos una demo de Mi Pádel Club por WhatsApp — reservas, jugadores, ranking y torneos en un solo lugar.",
};

// Página pública, compartible directamente (Instagram, Facebook, WhatsApp,
// email, campañas) — nunca un modal. Hereda Navbar/Footer del grupo
// (marketing). Server Component estático; toda la interactividad vive en
// DemoForm (Client Component).
export default function DemoPage() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-lg mx-auto px-5 pt-28 pb-20 sm:pt-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Solicita una demo
        </h1>
        <p className="text-brand-muted mb-10 leading-relaxed">
          Cuéntanos sobre tu club y te contactamos por WhatsApp para coordinar
          una demo de Mi Pádel Club — sin costo y sin compromiso.
        </p>
        <DemoForm />
      </div>
    </div>
  );
}
