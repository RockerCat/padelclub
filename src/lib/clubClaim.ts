import { randomBytes, createHash } from "crypto";

// Entrega de Club — shared token generation/hashing, used on both sides of
// the flow (platform: generate + hash before storing; /claim-club/[token]:
// hash the URL param before ever querying the DB). The raw token is never
// persisted anywhere — only its SHA-256 hex digest is sent to Postgres, by
// either side. Single source of truth for the algorithm so generation and
// lookup can never drift apart.
//
// 256 bits of entropy (32 random bytes), base64url-encoded so it's safe to
// drop straight into a URL path segment with no escaping.
export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Best-effort audit data ONLY — never read as an authorization input
// anywhere in claim_club. Strips whitespace, drops anything that doesn't
// look like an IPv4/IPv6 address at all (a spoofed or garbage header value
// is discarded rather than stored), and caps length well above the 45-char
// max textual length of an IPv6 address. claim_club's own INSERT also caps
// at 64 chars server-side as defense in depth, in case this RPC is ever
// called directly instead of through claimClub.
const IP_SHAPE = /^[0-9a-fA-F:.]+$/;
const MAX_IP_LENGTH = 64;

export function sanitizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_IP_LENGTH);
  return trimmed && IP_SHAPE.test(trimmed) ? trimmed : null;
}
