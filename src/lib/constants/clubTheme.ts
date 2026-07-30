// Identidad cromática fija de Mi Pádel Club — la personalización de color
// por club fue eliminada por decisión de producto (podía generar problemas
// de contraste/legibilidad). Única fuente de verdad para estos dos colores:
// todo componente que antes leía `club.primary_color`/`club.secondary_color`
// (o los recibía como prop) debe importar estas constantes en su lugar,
// nunca repetir el hexadecimal de forma dispersa.
export const CLUB_PRIMARY_COLOR = "#00ffff";
export const CLUB_SECONDARY_COLOR = "#037172";
