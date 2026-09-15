import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../context/SettingsContext';

/**
 * PinModal — shows a 4-digit PIN keypad.
 * Props:
 *   onSuccess()  — called when correct PIN is entered
 *   onCancel()   — called when user dismisses
 *   title        — optional heading text
 */
export default function PinModal({ onSuccess, onCancel, onClose, title = '🔐 Enter PIN to continue' }) {
  const { verifyPin } = useSettings();
  const [digits, setDigits] = useState([]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleClose = useCallback(() => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  }, [onCancel, onClose]);

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const submit = useCallback((pin) => {
    if (verifyPin(pin)) {
      onSuccess();
    } else {
      setError(true);
      setShake(true);
      setDigits([]);
      setTimeout(() => setShake(false), 500);
    }
  }, [verifyPin, onSuccess]);

  const press = useCallback((key) => {
    setError(false);
    if (key === '⌫') {
      setDigits(d => d.slice(0, -1));
    } else {
      setDigits(d => {
        if (d.length >= 4) return d;
        const next = [...d, key];
        if (next.length === 4) {
          setTimeout(() => submit(next.join('')), 80);
        }
        return next;
      });
    }
  }, [submit]);

  // Keyboard support
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, handleClose]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="pin-modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="pin-modal-title" style={{ margin: 0 }}>{title}</div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleClose}
            style={{ padding: '2px 8px', fontSize: '1rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >✕</button>
        </div>

        {/* Dot display */}
        <div className={`pin-modal-dots ${shake ? 'pin-shake' : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`pin-modal-dot ${digits.length > i ? 'filled' : ''} ${error ? 'error' : ''}`} />
          ))}
        </div>

        {error && <div className="pin-modal-error">Incorrect PIN. Try again.</div>}

        {/* Keypad */}
        <div className="pin-modal-keypad">
          {KEYS.map((k, i) => (
            <button
              key={i}
              className={`pin-modal-key ${k === '' ? 'invisible' : ''} ${k === '⌫' ? 'backspace' : ''}`}
              onClick={() => k && press(k)}
              disabled={k === ''}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
