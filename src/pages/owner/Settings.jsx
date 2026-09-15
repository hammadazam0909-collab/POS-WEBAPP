import React, { useState, useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useMenu, useInventory, useOrders } from '../../hooks/useFirestore';
import PinModal from '../../components/PinModal';
import '../owner/Owner.css';

export default function Settings() {
  const { settings, updateSetting, updateSettings, isPinUnlocked, verifyPin } = useSettings();
  const { categories, loading: menuLoading } = useMenu();
  const { items: inventoryItems, loading: invLoading } = useInventory();

  const [showSetPin, setShowSetPin] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState('verify');
  const [pinMsg, setPinMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null); // true | false | null
  const [showOrderTakersModal, setShowOrderTakersModal] = useState(false);
  const [newOrderTaker, setNewOrderTaker] = useState('');
  const [showInvoiceTextModal, setShowInvoiceTextModal] = useState(false);
  const [tempInvoiceText, setTempInvoiceText] = useState('');
  const [isEditingTax, setIsEditingTax] = useState(false);
  const [tempTax, setTempTax] = useState(settings.taxRate || 0);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [tempOpen, setTempOpen] = useState(settings.openTime || '00:00');
  const [tempClose, setTempClose] = useState(settings.closeTime || '23:59');
  function handleAddOrderTaker() {
    if (!newOrderTaker.trim()) return;
    const current = settings.orderTakers || [];
    if (current.includes(newOrderTaker.trim())) {
      alert('This name already exists!');
      return;
    }
    updateSetting('orderTakers', [...current, newOrderTaker.trim()]);
    setNewOrderTaker('');
  }

  function handleDeleteOrderTaker(index) {
    const current = settings.orderTakers || [];
    const updated = current.filter((_, idx) => idx !== index);
    updateSetting('orderTakers', updated);
  }

  // ── Theme ───────────────────────────────────────────────────────
  function toggleTheme() {
    updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
  }

  // ── PIN change flow ─────────────────────────────────────────────
  function startChangePinFlow() {
    setPinStep('verify');
    setShowVerify(true);
  }

  function openSetPinDialog() {
    setNewPin(''); setConfirmPin(''); setPinMsg('');
    setShowSetPin(true);
  }

  function saveNewPin() {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinMsg('PIN must be exactly 4 digits.'); return;
    }
    if (newPin !== confirmPin) { setPinMsg('PINs do not match.'); return; }
    updateSetting('pin', newPin);
    setShowSetPin(false);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const loading = menuLoading || invLoading;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ Settings</h1>
        <p className="page-subtitle">Customize system & view inventory consumption reports</p>
      </div>

      <div className="content-area" style={{ maxWidth: 800 }}>

        {saved && (
          <div className="alert-success" style={{ marginBottom: 20 }}>
            ✅ Settings saved successfully
          </div>
        )}

        {/* ── Appearance ──────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-section-title">🎨 Appearance</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Theme</div>
              <div className="settings-sub">Switch between dark and light mode</div>
            </div>
            <div className="settings-toggle-group">
              <button className={`settings-theme-btn ${settings.theme === 'dark' ? 'active' : ''}`} onClick={() => updateSetting('theme', 'dark')}>🌙 Dark</button>
              <button className={`settings-theme-btn ${settings.theme === 'light' ? 'active' : ''}`} onClick={() => updateSetting('theme', 'light')}>☀️ Light</button>
            </div>
          </div>
        </div>

        {/* ── Security ────────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-section-title">🔐 Security</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Cart Edit PIN Protection</div>
              <div className="settings-sub">Require a PIN before modifying items in an active table order</div>
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={settings.pinEnabled} onChange={e => {
                const targetVal = e.target.checked;
                // Always require PIN verification to change this setting
                setPinStep('verify');
                setPendingToggle(targetVal);
                setShowVerify(true);
              }} />
              <span className="settings-toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Change PIN</div>
              <div className="settings-sub">Current PIN is {settings.pinEnabled ? '••••' : settings.pin}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={startChangePinFlow}>🔑 Change PIN</button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Order Takers</div>
              <div className="settings-sub">Manage names of persons taking takeaway orders</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowOrderTakersModal(true)}>👤 Manage</button>
          </div>
        </div>

        {/* ── Billing ─────────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-section-title">💰 Billing</div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Tax Rate (%)</div>
              <div className="settings-sub">Applied automatically on every order</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isEditingTax ? (
                <>
                  <input className="input" type="number" min="0" max="99" step="0.5" style={{ width: 80, textAlign: 'center' }} value={tempTax} onChange={e => setTempTax(parseFloat(e.target.value) || 0)} />
                  <span style={{ color: 'var(--text-muted)' }}>%</span>
                  <button className="btn btn-primary btn-sm" onClick={() => { updateSetting('taxRate', tempTax); setIsEditingTax(false); flash(); }}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingTax(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{settings.taxRate}%</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setIsEditingTax(true); setTempTax(settings.taxRate); }}>📝 Edit</button>
                </>
              )}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Invoice Footer Text</div>
              <div className="settings-sub">This text will appear at the bottom of provisional and final bills</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              setTempInvoiceText(settings.invoiceText || '');
              setShowInvoiceTextModal(true);
            }}>📝 Edit</button>
          </div>
        </div>

        {/* ── Operating Hours ────────────────────────────────────── */}
        <div className="settings-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div className="settings-section-title">🕒 Operating Hours</div>
              <div className="settings-sub">Define your business day. Sales after the close time will count towards the next business day.</div>
            </div>
            {!isEditingHours ? (
              <button className="btn btn-secondary btn-sm" onClick={() => { setIsEditingHours(true); setTempOpen(settings.openTime); setTempClose(settings.closeTime); }}>📝 Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { updateSettings({ openTime: tempOpen, closeTime: tempClose }); setIsEditingHours(false); flash(); }}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingHours(false)}>Cancel</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Open Time</label>
              <input 
                type="time" 
                className="input" 
                value={isEditingHours ? tempOpen : (settings.openTime || '00:00')} 
                onChange={e => setTempOpen(e.target.value)} 
                disabled={!isEditingHours}
              />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Close Time</label>
              <input 
                type="time" 
                className="input" 
                value={isEditingHours ? tempClose : (settings.closeTime || '23:59')} 
                onChange={e => setTempClose(e.target.value)} 
                disabled={!isEditingHours}
              />
            </div>
          </div>
        </div>

        {/* ── About ───────────────────────────────────────────────── */}
        <div className="settings-card">
          <div className="settings-section-title">ℹ️ About</div>
          <div className="settings-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div><div className="settings-label">POSparrow System</div><div className="settings-sub">v1.0.0</div></div>
            <span className="badge badge-success">Live</span>
          </div>
        </div>

      </div>

      {showVerify && (
        <PinModal 
          title="🔐 Verify PIN" 
          onSuccess={() => { 
            setShowVerify(false); 
            if (pendingToggle !== null) {
              updateSetting('pinEnabled', pendingToggle);
              setPendingToggle(null);
            } else if (pinStep === 'verify') {
              openSetPinDialog();
            }
          }} 
          onCancel={() => {
            setShowVerify(false);
            setPendingToggle(null);
          }} 
        />
      )}

      {showSetPin && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSetPin(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h3>🔑 Set PIN</h3><button className="btn btn-secondary btn-sm" onClick={() => setShowSetPin(false)}>✕</button></div>
            <div className="input-group"><label className="input-label">New PIN</label><input className="input" type="password" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus style={{ textAlign: 'center' }} /></div>
            <div className="input-group"><label className="input-label">Confirm PIN</label><input className="input" type="password" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} style={{ textAlign: 'center' }} /></div>
            {pinMsg && <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', marginBottom: 12 }}>{pinMsg}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={() => setShowSetPin(false)}>Cancel</button><button className="btn btn-primary" onClick={saveNewPin}>Save</button></div>
          </div>
        </div>
      )}

      {showOrderTakersModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowOrderTakersModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h3>👤 Manage Order Takers</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowOrderTakersModal(false)}>✕</button>
            </div>
            <div style={{ padding: '10px 0' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <input 
                  className="input" 
                  placeholder="Enter name..." 
                  value={newOrderTaker} 
                  onChange={e => setNewOrderTaker(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && handleAddOrderTaker()}
                />
                <button className="btn btn-primary" onClick={handleAddOrderTaker}>Add</button>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {(settings.orderTakers || []).map((name, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-glass)', borderRadius: 6, marginBottom: 8 }}>
                    <span>{name}</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrderTaker(idx)}>✕</button>
                  </div>
                ))}
                {(!settings.orderTakers || settings.orderTakers.length === 0) && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>No order takers added yet.</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowOrderTakersModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showInvoiceTextModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowInvoiceTextModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>📝 Edit Invoice Footer Text</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowInvoiceTextModal(false)}>✕</button>
            </div>
            <div style={{ padding: '10px 0' }}>
              <div className="input-group">
                <label className="input-label">Footer Text</label>
                <textarea 
                  className="input" 
                  placeholder="e.g. No Refund / No Exchange after 24 hours" 
                  style={{ width: '100%', minHeight: 120, resize: 'vertical' }}
                  value={tempInvoiceText} 
                  onChange={e => setTempInvoiceText(e.target.value)} 
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowInvoiceTextModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                updateSetting('invoiceText', tempInvoiceText);
                setShowInvoiceTextModal(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
