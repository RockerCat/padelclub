// Única utilidad de normalización/validación de teléfono del proyecto —
// auditado: no existía ninguna convención previa (profiles.phone es texto
// libre, sin CHECK, nunca antes tenía un formulario que lo escribiera).
// Reutilizada por el registro de PLAYER (SignupForm), y por el botón de
// WhatsApp del modal de administración (MemberModal) — ninguno de los dos
// duplica esta lógica.
//
// Formato persistido: solo dígitos, código de país incluido cuando el
// usuario lo escribió, sin "+", sin espacios/paréntesis/guiones. Ej.:
// "573173672033". Nunca se antepone un código de país asumido — si el
// usuario no lo incluyó, el valor normalizado queda tal cual, más corto.

const MIN_DIGITS = 8; // número real más corto plausible (código de país + línea)
const MAX_DIGITS = 15; // límite superior de E.164

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s()-]/g, "").replace(/^\+/, "");
}

export function isValidPhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  return /^\d+$/.test(normalized) && normalized.length >= MIN_DIGITS && normalized.length <= MAX_DIGITS;
}

export function toWhatsAppLink(storedPhone: string): string {
  return `https://wa.me/${normalizePhone(storedPhone)}`;
}
