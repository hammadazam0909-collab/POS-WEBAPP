import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const PIN_LENGTH = 4;

export default function PinEntry() {
  const { restaurant, verifyOwnerPin, logout } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!restaurant) {
      navigate('/');
    }
  }, [restaurant, navigate]);

  async function submitPin(currentPin) {
    setLoading(true);
    setError('');
    try {
      await verifyOwnerPin(currentPin);
      navigate('/owner');
    } catch (err) {
      setError('Incorrect PIN. Try again.');
      triggerShake();
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function handleKey(val) {
    if (loading) return;
    if (val === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    const next = pin + val;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      submitPin(next);
    }
  }

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (loading) return;
      if (e.key >= '0' && e.key <= '9') {
        handleKey(e.key);
      } else if (e.key === 'Backspace') {
        handleKey('del');
      } else if (e.key === 'Enter') {
        if (pin.length === PIN_LENGTH) {
          submitPin(pin);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, pin]);

  if (!restaurant) return null;

  const keys = ['1','2','3','4','5','6','7','8','9','del','0','✓'];

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
      </div>

      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo"><span>AR</span></div>
          <h1 className="auth-title">Owner Access</h1>
          <p className="auth-subtitle">{restaurant.name}</p>
        </div>

        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-card-icon" style={{ fontSize: '2rem' }}>🔐</div>
          <h2 style={{ marginBottom: 6 }}>Enter Owner PIN</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 0 }}>
            Enter your {PIN_LENGTH}-digit PIN to access the owner portal
          </p>

          {error && (
            <div className="alert alert-error" style={{ marginTop: 16, textAlign: 'left' }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* PIN dots */}
          <div className={`pin-display ${shake ? 'pin-shake' : ''}`}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
            ))}
          </div>

          {/* Keypad */}
          <div className="pin-keypad">
            {keys.map(k => (
              <button
                key={k}
                id={`pin-key-${k}`}
                className={`pin-key ${k === 'del' ? 'delete' : ''} ${k === '✓' ? 'submit' : ''}`}
                onClick={() => k === '✓' ? (pin.length === PIN_LENGTH && submitPin(pin)) : handleKey(k)}
                disabled={loading}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              id="backFromPinBtn"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (restaurant?.businessType === 'retail') {
                  logout();
                  navigate('/');
                } else {
                  navigate('/select-role');
                }
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .pin-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97); }
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
