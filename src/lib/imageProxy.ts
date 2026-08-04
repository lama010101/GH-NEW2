export function toProxiedImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;
  if (url.startsWith('/')) return url; // local or already-proxied path
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return url;
    if (u.hostname.toLowerCase() !== 'firebasestorage.googleapis.com') return url;
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
