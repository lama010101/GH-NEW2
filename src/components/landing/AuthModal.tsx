'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/core/supabaseBrowser';

const RAINBOW_GRADIENT =
  'linear-gradient(45deg, #c4b5fd 0%, #f9a8d4 20%, #fdba74 45%, #fde68a 70%, #86efac 100%)';

type Tab = 'signin' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [confirmFocus, setConfirmFocus] = useState(false);

  if (!isOpen) return null;

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleGuest() {
    router.push('/compete');
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setError(null);
    setSuccessMessage(null);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    const { error: authError } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push('/compete');
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabaseBrowser.auth.signUp({
      email,
      password,
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setSuccessMessage('Check your email to confirm your account.');
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%',
    background: '#1a1a1a',
    border: `1px solid ${focused ? '#f97316' : 'rgba(255,255,255,0.15)'}`,
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
    marginBottom: 12,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  });

  const submitButtonStyle: React.CSSProperties = {
    width: '100%',
    background: '#fff',
    color: '#000',
    border: 'none',
    borderRadius: 9999,
    padding: 14,
    fontWeight: 700,
    fontSize: '1rem',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    marginTop: 8,
    fontFamily: 'inherit',
  };

  const tabButton = (tab: Tab, label: string) => (
    <button
      type="button"
      onClick={() => switchTab(tab)}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom:
          activeTab === tab ? '2px solid #f97316' : '2px solid transparent',
        color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)',
        fontSize: '1rem',
        padding: '8px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          background: '#111',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.12)',
          padding: 32,
          width: 'min(480px, 90vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: '#f97316',
            fontSize: '1.5rem',
            cursor: 'pointer',
            lineHeight: 1,
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>

        <h2
          style={{
            color: '#fff',
            fontFamily: 'Georgia, serif',
            fontSize: '1.4rem',
            textAlign: 'center',
            margin: '0 0 20px 0',
            fontWeight: 700,
          }}
        >
          Welcome to Guess History
        </h2>

        <button
          type="button"
          onClick={handleGuest}
          style={{
            width: '100%',
            background: RAINBOW_GRADIENT,
            color: '#000',
            fontWeight: 700,
            border: 'none',
            borderRadius: 9999,
            padding: 14,
            cursor: 'pointer',
            fontSize: '1rem',
            fontFamily: 'inherit',
          }}
        >
          👤 Continue as guest
        </button>

        <div
          style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '0.75rem',
            margin: '16px 0',
            letterSpacing: '0.05em',
          }}
        >
          ── OR SIGN IN ──
        </div>
        <p
          style={{
            color: '#fff',
            fontSize: '0.85rem',
            textAlign: 'center',
            margin: '0 0 16px 0',
          }}
        >
          to track your progress and compete with others.
        </p>

        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: 24,
          }}
        >
          {tabButton('signin', 'Sign In')}
          {tabButton('signup', 'Sign Up')}
        </div>

        {activeTab === 'signin' ? (
          <form onSubmit={handleSignIn}>
            <input
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              style={inputStyle(emailFocus)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocus(true)}
              onBlur={() => setPasswordFocus(false)}
              style={inputStyle(passwordFocus)}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 12,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <span style={{ color: '#f97316', cursor: 'pointer' }}>
                Forgot password?
              </span>
            </div>
            <button type="submit" disabled={loading} style={submitButtonStyle}>
              {loading ? 'Signing in…' : '✉ Sign In'}
            </button>
            {error && (
              <div
                role="alert"
                style={{
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  marginTop: 8,
                }}
              >
                {error}
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            <input
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              style={inputStyle(emailFocus)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocus(true)}
              onBlur={() => setPasswordFocus(false)}
              style={inputStyle(passwordFocus)}
            />
            <input
              type="password"
              placeholder="Confirm Password"
              required
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setConfirmFocus(true)}
              onBlur={() => setConfirmFocus(false)}
              style={inputStyle(confirmFocus)}
            />
            <button type="submit" disabled={loading} style={submitButtonStyle}>
              {loading ? 'Creating…' : 'Create Account'}
            </button>
            {error && (
              <div
                role="alert"
                style={{
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  marginTop: 8,
                }}
              >
                {error}
              </div>
            )}
            {successMessage && (
              <div
                role="status"
                style={{
                  color: '#86efac',
                  fontSize: '0.85rem',
                  marginTop: 8,
                  textAlign: 'center',
                }}
              >
                {successMessage}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
