// PWA install prompt capture — single source of truth for beforeinstallprompt.
// Behaviour depends only on browser events + navigator state (deterministic).

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Fired on the window when the beforeinstallprompt event has been captured,
 * so mounted UI can re-check isInstallAvailable() and update honestly.
 */
export const INSTALL_PROMPT_CAPTURED_EVENT = 'gh-installprompt-captured'

type NavigatorStandalone = Navigator & { standalone?: boolean }

let capturedEvent: BeforeInstallPromptEvent | null = null
let captureInitialized = false

/**
 * True when the app is already running as an installed PWA:
 * display-mode: standalone (Chrome/Android/desktop) or navigator.standalone
 * === true (iOS Safari). Callers must treat this as already-installed and
 * never offer the install option.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (window.navigator as NavigatorStandalone).standalone === true
}

/**
 * Attach the one-time beforeinstallprompt capture. Stores the event and
 * suppresses the browser's mini-infobar via preventDefault. Safe to call
 * on every client mount — attaches at most one listener per page load.
 */
export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined' || captureInitialized) return
  captureInitialized = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    capturedEvent = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALL_PROMPT_CAPTURED_EVENT))
  })
}

/**
 * True when the beforeinstallprompt capture succeeded, i.e. a native
 * install prompt can be triggered on this browser. Never true once the
 * app is already installed (the event does not fire in standalone mode).
 */
export function isInstallAvailable(): boolean {
  return capturedEvent != null
}

/**
 * Trigger the captured install prompt and report the user's outcome.
 * Returns 'unavailable' when nothing was captured or the prompt fails.
 * The captured event is single-use — it is consumed on the first call.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!capturedEvent) return 'unavailable'
  const event = capturedEvent
  capturedEvent = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  } catch {
    return 'unavailable'
  }
}
