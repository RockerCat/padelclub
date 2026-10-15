import Image from "next/image";

// Capturas reales del producto (public/img/landing, copiadas de
// assets/real-screenshots — los originales no se tocan). El correo visible
// en las capturas OWNER es ficticio (confirmado por el propietario).

function Desktop({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
      <Image
        src={src}
        alt={alt}
        width={1435}
        height={875}
        sizes="(min-width: 1280px) 1100px, 100vw"
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}

function Phone({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[240px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
        <Image
          src={src}
          alt={alt}
          width={495}
          height={875}
          sizes="(min-width: 1024px) 240px, 45vw"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="text-center text-sm text-brand-muted">{caption}</figcaption>
    </figure>
  );
}

export default function ProductShowcase() {
  return (
    <section className="py-20 lg:py-28 border-t border-white/8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Gestión: estadísticas y canchas */}
        <div className="mb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-primary mb-3">
              Gestión del club
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Ocupación, rendimiento y canchas bajo control.
            </h2>
            <p className="mt-4 text-brand-muted leading-relaxed">
              Mira cuántas reservas, horas y qué tan ocupadas están tus canchas,
              sin hojas de cálculo ni mensajes de WhatsApp.
            </p>
          </div>
          <div className="mt-10 space-y-10">
            <figure>
              <Desktop
                src="/img/landing/owner-estadisticas.png"
                alt="Indicadores de rendimiento del club: reservas, horas reservadas y uso por cancha"
              />
              <figcaption className="mt-3 text-center text-sm text-brand-muted">
                Indicadores de rendimiento y uso por cancha
              </figcaption>
            </figure>
            <figure>
              <Desktop
                src="/img/landing/owner-canchas.png"
                alt="Gestión de canchas del club con tipo de superficie y estado activo"
              />
              <figcaption className="mt-3 text-center text-sm text-brand-muted">
                Crea y administra tus canchas en segundos
              </figcaption>
            </figure>
          </div>
        </div>

        {/* Club: página pública */}
        <div className="grid lg:grid-cols-[2fr_3fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand-primary mb-3">
              La casa digital de tu club
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Tu club con identidad propia, listo para recibir jugadores.
            </h2>
            <p className="mt-4 text-brand-muted leading-relaxed">
              Logo, portada, canchas, horarios y redes en una página pública que
              compartes con un solo enlace. Los jugadores solicitan acceso y tú
              los administras desde un solo lugar.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-brand-surface shadow-2xl shadow-black/50">
            <Image
              src="/img/landing/club-public-page.png"
              alt="Página pública de un club en Mi Pádel Club, con portada, canchas activas y horario"
              width={1435}
              height={875}
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>

        {/* Jugador: experiencia móvil */}
        <div className="mt-24">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-primary mb-3">
              Experiencia del jugador
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Reservas, ranking y torneos, desde el celular.
            </h2>
            <p className="mt-4 text-brand-muted leading-relaxed">
              Tus jugadores ven la disponibilidad, solicitan su cancha con la
              tarifa a la vista, siguen el ranking y su evolución sin escribirte
              por WhatsApp.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-8">
            <Phone
              src="/img/landing/player-disponibilidad.png"
              alt="Disponibilidad de canchas por día y horario en el celular"
              caption="Disponibilidad en tiempo real"
            />
            <Phone
              src="/img/landing/player-solicitud.png"
              alt="Solicitud de reserva con tarifa aplicada y valor de la reserva"
              caption="Solicitud con tarifa clara"
            />
            <Phone
              src="/img/landing/player-ranking.png"
              alt="Ranking del club con podio por categoría"
              caption="Ranking automático"
            />
            <Phone
              src="/img/landing/player-torneo.png"
              alt="Resultados de un torneo con podio final y clasificación"
              caption="Resultados de torneos"
            />
            <div className="col-span-2 lg:col-span-1 flex justify-center">
              <Phone
                src="/img/landing/player-evolucion.png"
                alt="Evolución deportiva del jugador con gráfico de puntos"
                caption="Evolución deportiva"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
