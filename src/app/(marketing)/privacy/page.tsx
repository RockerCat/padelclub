import type { Metadata } from "next";
import { MARKETING_WA_URL } from "@/lib/constants/marketingWhatsapp";

export const metadata: Metadata = {
  title: "Política de Privacidad | Mi Pádel Club",
  description:
    "Cómo Mi Pádel Club recopila, usa y protege la información de clubes y jugadores.",
};

// Correo dedicado a privacidad — NEEDS CONFIRMATION: no existe todavía un
// correo de soporte/privacidad confirmado en el repositorio. Nunca se
// inventa uno: mientras esta constante quede vacía, la sección de Contacto
// simplemente no muestra una línea de correo (solo el WhatsApp real, ya
// usado en el resto del sitio vía MARKETING_WA_URL). Reemplazar aquí en
// cuanto exista un correo real.
const PRIVACY_CONTACT_EMAIL = "";

const LAST_UPDATED = "7 de septiembre de 2026";

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg sm:text-xl font-bold text-white mb-3">
        {number}. {title}
      </h2>
      <div className="text-sm text-white/80 leading-relaxed flex flex-col gap-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}

// Página pública, sin autenticación ni datos privados — Server Component
// estático, sin llamadas a Supabase. Vive bajo (marketing) para heredar
// Navbar/Footer ya existentes (mismo shell que la landing), nunca un
// layout nuevo. Contenido basado únicamente en prácticas de datos
// confirmadas en el repositorio (ver auditoría de privacidad) — no incluye
// afirmaciones no soportadas (analítica/publicidad inexistentes, borrado de
// cuenta aún no implementado, geolocalización de dispositivo nunca
// solicitada).
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-3xl mx-auto px-5 pt-28 pb-20 sm:pt-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          Política de Privacidad
        </h1>
        <p className="text-xs text-brand-muted mb-10">
          Última actualización: {LAST_UPDATED}
        </p>

        <Section number={1} title="Política de Privacidad">
          <p>
            Esta Política de Privacidad explica qué información recopilamos en Mi Pádel Club
            (también identificada como PadelClub), cómo la usamos, quién puede verla y con
            quién la compartimos. Aplica a la plataforma web y a la aplicación móvil.
          </p>
          <p>
            Al crear una cuenta o usar Mi Pádel Club, aceptas las prácticas descritas en este
            documento.
          </p>
        </Section>

        <Section number={2} title="Sobre Mi Pádel Club">
          <p>
            Mi Pádel Club es una plataforma para que clubes de pádel administren sus
            operaciones (canchas, reservas, jugadores, torneos y ranking) y para que los
            jugadores encuentren disponibilidad, reserven canchas y sigan su actividad
            deportiva. Es la entidad responsable del tratamiento de la información descrita en
            esta política.
          </p>
        </Section>

        <Section number={3} title="Información que recopilamos">
          <p>Recopilamos la siguiente información, según cómo uses la plataforma:</p>
          <ul>
            <li>
              <strong>Cuenta y autenticación:</strong> tu correo electrónico y contraseña,
              gestionados por Supabase Auth. Nunca almacenamos tu contraseña en texto plano.
            </li>
            <li>
              <strong>Perfil:</strong> nombre completo, número de WhatsApp, foto de perfil
              (opcional) e identificadores internos de cuenta.
            </li>
            <li>
              <strong>Clubes y membresías:</strong> a qué clubes perteneces, tu rol, el estado
              de tu membresía y, si aplica, tus solicitudes de ingreso.
            </li>
            <li>
              <strong>Reservas:</strong> cancha, fecha y hora, estado de la reserva,
              participantes y demás información necesaria para gestionarla.
            </li>
            <li>
              <strong>Actividad deportiva:</strong> categoría, posición en el ranking, puntos e
              historial de ranking del club al que perteneces.
            </li>
            <li>
              <strong>Torneos:</strong> inscripciones, parejas o equipos, y resultados o
              posiciones cuando participas en un torneo.
            </li>
            <li>
              <strong>Notificaciones push:</strong> el token de notificación de tu dispositivo,
              la plataforma (iOS/Android), un identificador técnico del dispositivo y la fecha
              del último registro, asociados a tu cuenta.
            </li>
            <li>
              <strong>Archivos que subes:</strong> tu foto de perfil y, si administras un club,
              imágenes del club o de torneos.
            </li>
          </ul>
        </Section>

        <Section number={4} title="Cómo usamos la información">
          <p>Usamos la información recopilada para:</p>
          <ul>
            <li>Crear y mantener tu cuenta, y permitirte iniciar sesión de forma segura.</li>
            <li>Permitir la reserva y gestión de canchas dentro de un club.</li>
            <li>
              Mostrar el ranking, las categorías y los torneos de los clubes a los que
              perteneces.
            </li>
            <li>
              Permitir que el propietario o administrador de un club te contacte por WhatsApp
              cuando sea necesario para la operación del club.
            </li>
            <li>Enviarte notificaciones relevantes sobre tu actividad dentro de un club.</li>
            <li>Mantener la seguridad, integridad y buen funcionamiento del servicio.</li>
          </ul>
        </Section>

        <Section number={5} title="Información visible para otros usuarios">
          <p>No toda tu información es visible para todas las personas. En general:</p>
          <ul>
            <li>
              <strong>Solo tú</strong> puedes ver el detalle completo de tu propio perfil,
              incluido tu número de WhatsApp.
            </li>
            <li>
              <strong>El propietario o administrador de un club al que perteneces</strong>{" "}
              puede ver la información de membresía necesaria para administrar el club, y
              puede contactarte por WhatsApp a través de una acción de contacto autorizada
              dentro de la plataforma. Tu número de teléfono no se muestra como texto libre a
              otros jugadores ni se expone en consultas generales de perfil.
            </li>
            <li>
              <strong>Otros miembros del mismo club</strong> pueden ver información limitada
              cuando es necesaria para el funcionamiento de la app — por ejemplo, el nombre y
              la foto de otros participantes de una reserva compartida, o de una pareja de
              torneo.
            </li>
            <li>
              <strong>El público</strong> (sin necesidad de iniciar sesión) puede ver el
              contenido que un club haya configurado explícitamente como público — por
              ejemplo, la página pública de un club, su ranking, o noticias publicadas, que
              pueden incluir nombre, foto, categoría y puntos de un jugador.
            </li>
          </ul>
        </Section>

        <Section number={6} title="Clubes, reservas, rankings y torneos">
          <p>
            Cada club mantiene su propia información de membresía, canchas, reservas, ranking y
            torneos. Los datos de un club (jugadores, reservas, ranking, torneos) están
            separados de los de otros clubes.
          </p>
          <p>
            Las reservas incluyen quién la creó o solicitó, la cancha, la fecha y hora, su
            estado y sus participantes. Esta información es visible para quienes la crearon,
            participan en ella, o administran el club correspondiente.
          </p>
          <p>
            El ranking (categoría, posición y puntos) y los torneos (inscripciones, parejas y
            resultados) se calculan y muestran dentro del club. Si un club está configurado
            como público, esta información puede ser visible sin necesidad de iniciar sesión.
            Las noticias publicadas por un club, incluidas las relacionadas con resultados de
            torneos, pueden mostrar nombres de jugadores y ser visibles públicamente.
          </p>
        </Section>

        <Section number={7} title="Fotografías y archivos">
          <p>
            Puedes subir una foto de perfil. Si eres propietario o administrador de un club,
            también puedes subir imágenes del club o de torneos. Estos archivos se almacenan
            usando Supabase Storage. Algunas imágenes (como fotos de perfil y de clubes) se
            sirven mediante URLs públicas, ya que están pensadas para mostrarse dentro de la
            plataforma y en páginas públicas de clubes.
          </p>
        </Section>

        <Section number={8} title="Notificaciones push">
          <p>
            Usamos el servicio de notificaciones push de Expo (Expo Push Notification Service)
            para enviarte notificaciones en la aplicación móvil. Para esto almacenamos el token
            de notificación de tu dispositivo, la plataforma (iOS/Android), un identificador
            técnico del dispositivo, la fecha de registro y la asociación con tu cuenta.
          </p>
          <p>
            El contenido de una notificación puede incluir información relacionada con un
            club, una reserva o un jugador (por ejemplo, el nombre de quien solicitó unirse a
            una reserva). Puedes controlar los permisos de notificación desde la configuración
            de tu dispositivo en cualquier momento.
          </p>
        </Section>

        <Section number={9} title="Ubicación y mapas">
          <p>
            Mi Pádel Club <strong>no solicita ni recopila la ubicación GPS de tu dispositivo</strong>.
          </p>
          <p>
            La ubicación que se muestra en el mapa de un club corresponde a la dirección y
            coordenadas que el club ingresó manualmente al configurar su información, no a tu
            ubicación como usuario. En la versión web, los mapas y la conversión de una
            dirección a coordenadas pueden usar OpenStreetMap y su servicio de geocodificación,
            Nominatim. En la aplicación móvil, los mapas pueden usar el proveedor de mapas
            nativo del sistema operativo de tu dispositivo.
          </p>
        </Section>

        <Section number={10} title="Proveedores de servicios">
          <p>
            Para operar Mi Pádel Club trabajamos con los siguientes proveedores, que procesan
            información en nuestro nombre:
          </p>
          <ul>
            <li>
              <strong>Supabase:</strong> autenticación, base de datos, almacenamiento de
              archivos y servicios de backend en tiempo real.
            </li>
            <li>
              <strong>Expo:</strong> entrega de notificaciones push en la aplicación móvil.
            </li>
            <li>
              <strong>OpenStreetMap / Nominatim:</strong> mapas y geocodificación de
              direcciones de clubes en la versión web.
            </li>
          </ul>
        </Section>

        <Section number={11} title="Publicidad, analítica y rastreo">
          <p>
            Mi Pádel Club no utiliza publicidad, identificadores publicitarios ni rastreo entre
            aplicaciones. Actualmente no usamos ningún SDK de analítica ni de publicidad
            comportamental.
          </p>
        </Section>

        <Section number={12} title="Conservación de información">
          <p>
            Conservamos tu información mientras tengas una cuenta activa y mientras sea
            necesaria para operar el servicio, atender requerimientos operativos o cumplir
            obligaciones legales aplicables.
          </p>
          <p>
            Puedes eliminar tu cuenta en cualquier momento desde la aplicación móvil (Perfil →
            Eliminar cuenta) o desde la web (Mi Perfil → Eliminar cuenta). También publicamos
            instrucciones públicas en{" "}
            <a href="/delete-account" className="text-brand-primary hover:underline">
              mipadel.club/delete-account
            </a>
            . Al eliminar tu cuenta: tu información personal (nombre, foto de perfil, teléfono)
            se elimina o se anonimiza, y el acceso a tu cuenta se deshabilita de forma
            permanente. Algunos registros operativos del club — como reservas, ranking o
            resultados de torneos en los que participaste — pueden conservarse de forma anónima
            (mostrados como "Usuario eliminado") para mantener la integridad de esa información
            para el club y otros jugadores. Las noticias ya publicadas por un club son contenido
            editorial de texto libre y no se reescriben retroactivamente. Si tu cuenta es
            actualmente propietaria activa de un club, primero debes resolver la transferencia o
            el cierre del club con nuestro equipo antes de poder eliminar tu cuenta.
          </p>
        </Section>

        <Section number={13} title="Seguridad">
          <p>
            Aplicamos medidas técnicas y de control de acceso razonables para proteger tu
            información, como autenticación de usuarios y reglas de autorización a nivel de
            base de datos que limitan qué información puede leer o modificar cada persona según
            su rol. Ningún sistema es completamente seguro, por lo que no podemos garantizar
            una seguridad absoluta.
          </p>
        </Section>

        <Section number={14} title="Privacidad de menores">
          <p>
            Mi Pádel Club no está diseñado intencionalmente para recopilar información personal
            de menores de edad en contravención de la ley aplicable. Si eres madre, padre o
            acudiente y crees que un menor a tu cargo nos ha proporcionado información
            personal, puedes contactarnos para solicitar su revisión o eliminación.
          </p>
        </Section>

        <Section number={15} title="Cambios a esta política">
          <p>
            Podemos actualizar esta Política de Privacidad de vez en cuando, por ejemplo para
            reflejar cambios en la plataforma o en la normativa aplicable. Cuando lo hagamos,
            actualizaremos la fecha de "Última actualización" al inicio de este documento. Te
            recomendamos revisarla periódicamente.
          </p>
        </Section>

        <Section number={16} title="Contacto">
          <p>Si tienes preguntas sobre esta política o sobre tu información, puedes escribirnos:</p>
          <ul>
            <li>
              <a
                href={MARKETING_WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:underline"
              >
                Por WhatsApp
              </a>
            </li>
            {PRIVACY_CONTACT_EMAIL && (
              <li>
                Por correo:{" "}
                <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-brand-primary hover:underline">
                  {PRIVACY_CONTACT_EMAIL}
                </a>
              </li>
            )}
          </ul>
        </Section>
      </div>
    </div>
  );
}
