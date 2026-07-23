// Only accept relative, same-app paths for post-auth redirects (?next=,
// ?returnTo=). Rejects absolute URLs and protocol-relative "//host" paths
// so a crafted link can't bounce a user off to an external site after
// login/signup — the classic open-redirect shape.
export function getSafeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return null;
  }
  return path;
}
