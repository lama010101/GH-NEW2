/**
 * Browser Fullscreen API helpers — single source of truth for entering/exiting
 * fullscreen across the app. Safari uses webkit-prefixed methods.
 *
 * All helpers fail silently: fullscreen requests can be rejected by the browser
 * (e.g. iOS Safari has no arbitrary-element fullscreen support) and must never
 * surface an error to the user or block the gesture that triggered them.
 */

/** True when the document is currently in fullscreen. */
export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null
}

/** Enter fullscreen on the document root. Resolves silently on rejection. */
export async function enterFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  try {
    if (typeof document.documentElement.requestFullscreen === 'function') {
      await document.documentElement.requestFullscreen()
    } else if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen()
    }
  } catch {
    /* fullscreen request rejected — fail silently */
  }
}

/** Exit fullscreen if currently active. Resolves silently if not in fullscreen. */
export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    if (typeof document.exitFullscreen === 'function' && document.fullscreenElement != null) {
      await document.exitFullscreen()
    }
  } catch {
    /* exit rejected — fail silently */
  }
}
