'use client'

import { useEffect } from 'react'
import { enterFullscreen, isFullscreen } from '@/lib/fullscreen'

/** Matches the app's mobile breakpoint — fullscreen auto-entry is mobile-only. */
const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

/**
 * Auto-enters fullscreen on the first user interaction, on mobile viewports only.
 * Browsers require a user gesture to grant fullscreen, so this attaches one-time
 * capture-phase listeners for the first click/touchstart/keydown and requests
 * fullscreen then.
 *
 * The listener removes itself after firing — regardless of whether the request
 * succeeded or was rejected — so it never re-triggers on subsequent gestures.
 * It does not call preventDefault/stopPropagation, so the triggering gesture
 * still does whatever it would normally do.
 */
export default function AutoFullscreen() {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return

    const onFirstInteraction = () => {
      // Remove immediately so this only fires once per page load.
      document.removeEventListener('click', onFirstInteraction, true)
      document.removeEventListener('touchstart', onFirstInteraction, true)
      document.removeEventListener('keydown', onFirstInteraction, true)
      if (!isFullscreen()) {
        void enterFullscreen()
      }
    }

    document.addEventListener('click', onFirstInteraction, true)
    document.addEventListener('touchstart', onFirstInteraction, true)
    document.addEventListener('keydown', onFirstInteraction, true)

    return () => {
      document.removeEventListener('click', onFirstInteraction, true)
      document.removeEventListener('touchstart', onFirstInteraction, true)
      document.removeEventListener('keydown', onFirstInteraction, true)
    }
  }, [])

  return null
}
