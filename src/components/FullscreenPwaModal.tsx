'use client'

import { useEffect, useState } from 'react'
import { enterFullscreen, isFullscreen } from '@/lib/fullscreen'
import { isIOsSafariNonPwa } from '@/core/relaxPwaInterstitial'
import {
  INSTALL_PROMPT_CAPTURED_EVENT,
  initInstallPromptCapture,
  isInstallAvailable,
  isStandalonePwa,
  promptInstall,
} from '@/core/installPrompt'
import modalStyles from '@/components/AuthModal.module.css'

/** Matches the app's mobile breakpoint — the first-visit auto-trigger is mobile-only. */
const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

/**
 * localStorage gate for the first-visit modal. Values:
 *  (absent) — never seen → auto-show the modal (mobile, non-standalone, not fullscreen)
 *  'seen'   — answered/dismissed without "remember" → never auto-show again
 *  'auto'   — "Remember my choice" + Enter Fullscreen → on future mobile loads,
 *             silently auto-enter fullscreen on first interaction (the old
 *             AutoFullscreen behaviour) and never auto-show the modal.
 */
export const FULLSCREEN_PWA_CHOICE_KEY = 'gh_fullscreen_pwa_choice'

/** Window event fired by NavModal to open this modal on demand (manual re-trigger). */
export const OPEN_FULLSCREEN_PWA_MODAL_EVENT = 'gh-open-fullscreen-pwa-modal'

function readChoice(): string | null {
  try {
    return localStorage.getItem(FULLSCREEN_PWA_CHOICE_KEY)
  } catch {
    return null
  }
}

function writeChoice(value: 'seen' | 'auto'): void {
  try {
    localStorage.setItem(FULLSCREEN_PWA_CHOICE_KEY, value)
  } catch {
    // storage unavailable — modal will simply re-show on the next load
  }
}

/**
 * First-visit fullscreen / PWA-install choice modal (replaces the old silent
 * auto-fullscreen). Auto-triggers once on mobile viewports; also openable on
 * demand from the NavModal menu via OPEN_FULLSCREEN_PWA_MODAL_EVENT, which
 * ignores the "seen" gate entirely.
 */
export default function FullscreenPwaModal() {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [installReady, setInstallReady] = useState(false)
  const [iosNonPwa, setIosNonPwa] = useState(false)
  const [fsActive, setFsActive] = useState(false)

  // First-visit auto-trigger + remembered silent auto-entry.
  useEffect(() => {
    if (typeof window === 'undefined') return
    initInstallPromptCapture()

    // Remembered choice: replicate the old AutoFullscreen behaviour verbatim —
    // one-shot capture-phase listeners, mobile only, no modal.
    if (readChoice() === 'auto' && window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
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
    }

    // First visit: show the choice modal once (mobile, not installed, not fullscreen).
    if (readChoice() != null) return
    if (isStandalonePwa()) return
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return
    if (isFullscreen()) return
    setIosNonPwa(isIOsSafariNonPwa())
    setFsActive(isFullscreen())
    setOpen(true)
  }, [])

  // Manual re-trigger from the menu — ignores the "seen" gate entirely.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOpen = () => {
      setIosNonPwa(isIOsSafariNonPwa())
      setFsActive(isFullscreen())
      setInstallReady(isInstallAvailable())
      setOpen(true)
    }
    window.addEventListener(OPEN_FULLSCREEN_PWA_MODAL_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_FULLSCREEN_PWA_MODAL_EVENT, onOpen)
  }, [])

  // Keep the Install button honest if the capture lands while the modal is open.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onCaptured = () => setInstallReady(isInstallAvailable())
    window.addEventListener(INSTALL_PROMPT_CAPTURED_EVENT, onCaptured)
    return () => window.removeEventListener(INSTALL_PROMPT_CAPTURED_EVENT, onCaptured)
  }, [])

  const handleDismiss = () => {
    // Mark seen without touching an existing 'auto' remember flag.
    if (readChoice() == null) writeChoice('seen')
    setOpen(false)
  }

  const handleEnterFullscreen = () => {
    writeChoice(remember ? 'auto' : 'seen')
    void enterFullscreen()
    setOpen(false)
  }

  const handleInstall = async () => {
    // Installs are inherently one-time — mark seen; no remember logic here.
    writeChoice('seen')
    setOpen(false)
    await promptInstall()
  }

  if (!open) return null

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true" onClick={handleDismiss}>
      <div className={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={modalStyles.closeButton}
          onClick={handleDismiss}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className={modalStyles.title}>Fullscreen &amp; install</h2>
        <p className={modalStyles.tagline} style={{ marginBottom: 16 }}>
          Choose how Guess-History opens on this device.
        </p>

        {fsActive ? (
          <p
            style={{
              color: 'var(--gh-modal-text-secondary)',
              fontSize: 'var(--font-sm)',
              margin: '0 0 16px 0',
              textAlign: 'center',
            }}
          >
            Fullscreen is already active.
          </p>
        ) : (
          <button type="button" className={modalStyles.submitButton} onClick={handleEnterFullscreen}>
            Enter Fullscreen
          </button>
        )}

        {installReady ? (
          <button
            type="button"
            className={modalStyles.submitButton}
            style={{ marginTop: 12 }}
            onClick={handleInstall}
          >
            Install App
          </button>
        ) : iosNonPwa ? (
          <div style={{ marginTop: 12 }}>
            <p
              style={{
                color: 'var(--gh-modal-text-secondary)',
                fontSize: 'var(--font-sm)',
                margin: '0 0 8px 0',
              }}
            >
              <strong>Add to Home Screen</strong> to install the app:
            </p>
            <ol
              style={{
                color: 'var(--gh-modal-text-secondary)',
                fontSize: 'var(--font-sm)',
                paddingLeft: 20,
                margin: '0 0 8px 0',
                lineHeight: 1.5,
              }}
            >
              <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>, then open Guess-History from your Home Screen.</li>
            </ol>
          </div>
        ) : (
          <p
            style={{
              color: 'var(--gh-modal-text-secondary)',
              fontSize: 'var(--font-sm)',
              margin: '12px 0 0 0',
              textAlign: 'center',
            }}
          >
            App install is not available in this browser.
          </p>
        )}

        <label className={modalStyles.rememberMeContainer} style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            className={modalStyles.rememberMeCheckbox}
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className={modalStyles.rememberMeLabel}>Remember my choice</span>
        </label>
      </div>
    </div>
  )
}
