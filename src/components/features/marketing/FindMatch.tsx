import Link from "next/link";
import { Plus, Search, Users, MessageCircle, MapPin } from "lucide-react";

const steps = [
  { icon: Search, title: "Busca", text: "Partidos abiertos en tu ciudad, por fecha y nivel." },
  { icon: Users, title: "Únete o crea", text: "Toma un cupo libre o publica el tuyo con los jugadores que ya tienes." },
  { icon: MessageCircle, title: "Comparte", text: "Envía el enlace por WhatsApp y completa los cuatro." },
  { icon: MapPin, title: "Coordina la cancha", text: "Indica dónde juegan y cuándo la reservaste. Antes o después, como prefieras." },
];

// Propuesta de valor para jugadores independientes — funciona aunque
// ningún club de su ciudad use Mi Pádel Club. Sección compacta: la landing
// sigue siendo comercial para clubes (Hero/demo intactos).
export default function FindMatch() {
  return (
    <section id="partidos" className="border-t border-white/5 bg-brand-bg py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
              <span className="text-xs font-medium uppercase tracking-widest text-brand-primary">Para jugadores · gratis</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              ¿Te faltan jugadores? <span className="text-brand-primary">Encuentra tu partido.</span>
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-brand-muted">
              Armar un partido de pádel necesita cuatro. Encuentra compañeros y rivales con tu nivel y horario,
              aunque tu club no esté en Mi Pádel Club.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/partidos"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-base font-semibold text-brand-bg shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90"
              >
                <Search className="h-4 w-4" /> Encontrar partido
              </Link>
              <Link
                href="/partidos/crear"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-base font-semibold text-white hover:bg-white/5"
              >
                <Plus className="h-4 w-4" /> Crear partido
              </Link>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-brand-surface p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-primary/10 text-xs font-bold text-brand-primary">
                    {i + 1}
                  </span>
                  <Icon className="h-4 w-4 text-brand-primary" />
                  <span className="text-sm font-semibold text-white">{title}</span>
                </div>
                <p className="mt-2 text-sm leading-snug text-brand-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
