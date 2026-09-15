import React, { useState, useEffect } from 'react';
import { db, getSecondaryAuth } from '../../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function CreateRestaurant() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    restaurantId: '',
    name: '',
    password: '',
    ownerPin: '',
    phone: '',
    address: '',
    email: '',
    paymentDueDate: '',
    logo: '', // Base64 logo
    planId: '',
    customPlanPrice: '',
    isTrial: false,
    businessType: 'restaurant',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const snap = await getDocs(collection(db, 'subscription_plans'));
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching plans:", err);
      }
    }
    fetchPlans();
  }, []);

  function upd(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500000) { // 500KB limit for Base64 storage in Firestore
      setError('Logo file too large. Please use an image under 500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => upd('logo', reader.result);
    reader.readAsDataURL(file);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.restaurantId || !form.name || !form.password || !form.ownerPin) {
      setError('Restaurant ID, name, password, and owner PIN are required');
      return;
    }
    if (form.ownerPin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    setSaving(true);
    try {
      // Find selected plan to copy allowedPages
      const selectedPlan = plans.find(p => p.id === form.planId);
      const allowedPages = selectedPlan ? selectedPlan.allowedPages : ['dashboard', 'settings'];

      // Create Firestore document using restaurantId as document ID
      await setDoc(doc(db, 'restaurants', form.restaurantId), {
        name: form.name,
        password: form.password,
        ownerPin: form.ownerPin,
        phone: form.phone,
        address: form.address,
        email: form.email,
        paymentDueDate: form.paymentDueDate,
        logo: form.logo,
        planId: form.planId || '',
        customPlanPrice: form.customPlanPrice ? Number(form.customPlanPrice) : null,
        isTrial: form.isTrial,
        isDemo: form.isDemo || false,
        businessType: form.businessType || 'restaurant',
        allowedPages: allowedPages,
        status: 'active',
        blockedReason: '',
        createdAt: new Date().toISOString(),
      });
      setSuccess(`✅ Restaurant "${form.name}" created! Login ID: ${form.restaurantId}`);
      setForm({ restaurantId: '', name: '', password: '', ownerPin: '', phone: '', address: '', email: '', paymentDueDate: '', logo: '', planId: '', customPlanPrice: '', isTrial: false, isDemo: false, businessType: 'restaurant' });
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">➕ Create Restaurant</h1>
        <p className="page-subtitle">Set up a new restaurant account with login credentials</p>
      </div>

      <div className="content-area">
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            {error && <div className="alert alert-error" style={{ marginBottom: 20 }}><span>⚠️</span> {error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 20 }}><span>✅</span> {success}</div>}

            <form onSubmit={handleCreate}>
              <h4 style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>Login Credentials</h4>

              <div className="input-group">
                <label className="input-label">Restaurant ID * <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(used to login — no spaces)</span></label>
                <input id="restId" className="input" placeholder="e.g. rest_karachi_01" value={form.restaurantId} onChange={e => upd('restaurantId', e.target.value.toLowerCase().replace(/\s/g, '_'))} required autoFocus />
              </div>

              <div className="input-group">
                <label className="input-label">Login Password *</label>
                <input id="restPass" className="input" type="password" placeholder="Restaurant login password" value={form.password} onChange={e => upd('password', e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Owner PIN * <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(4 digits — for owner portal)</span></label>
                <input id="ownerPin" className="input" type="password" placeholder="4-digit PIN" maxLength={6} value={form.ownerPin} onChange={e => upd('ownerPin', e.target.value.replace(/\D/g, ''))} required />
              </div>

              <div className="divider" />
              <h4 style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>Restaurant Details</h4>

              <div className="input-group">
                <label className="input-label">Restaurant Name *</label>
                <input id="restName" className="input" placeholder="e.g. Karachi BBQ" value={form.name} onChange={e => upd('name', e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Business Type *</label>
                <select className="input" value={form.businessType} onChange={e => {
                  const newType = e.target.value;
                  setForm(f => ({ ...f, businessType: newType, planId: '' }));
                }} required>
                  <option value="restaurant">🍽️ Restaurant Mode</option>
                  <option value="retail">🛍️ Retail Mode</option>
                </select>
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Phone</label>
                  <input className="input" placeholder="03xx-xxxxxxx" value={form.phone} onChange={e => upd('phone', e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="input-label">Email</label>
                  <input className="input" type="email" placeholder="owner@restaurant.com" value={form.email} onChange={e => upd('email', e.target.value)} />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Address</label>
                <input className="input" placeholder="Restaurant address" value={form.address} onChange={e => upd('address', e.target.value)} />
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Subscription Plan</label>
                  <select className="input" value={form.planId} onChange={e => upd('planId', e.target.value)}>
                    <option value="">None (Default features)</option>
                    {plans.filter(p => (p.planType || 'restaurant') === form.businessType).map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Rs {p.amount})</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Custom Price (Rs)</label>
                  <input className="input" type="number" placeholder="Override plan price" value={form.customPlanPrice} onChange={e => upd('customPlanPrice', e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -12, marginBottom: 18 }}>
                Determines features and billing amount. Custom price overrides default rate.
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', color: 'var(--success)' }}>
                  <input type="checkbox" checked={form.isTrial} onChange={e => upd('isTrial', e.target.checked)} />
                  🎁 1-Month Promotion / Trial
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', color: 'var(--info)' }}>
                  <input type="checkbox" checked={form.isDemo} onChange={e => upd('isDemo', e.target.checked)} />
                  🧪 Demo Account (Exclude from Revenue)
                </label>
              </div>

              <div className="input-group">
                <label className="input-label">Restaurant Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15, background: 'var(--bg-glass)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {form.logo ? (
                      <img src={form.logo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: '0.8rem' }} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>JPG/PNG under 500KB. Recommended size: 200x200px</div>
                  </div>
                  {form.logo && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => upd('logo', '')}>✕ Clear</button>
                  )}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Payment Due Date</label>
                <input className="input" type="date" value={form.paymentDueDate} onChange={e => upd('paymentDueDate', e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/dashboard/restaurants')}>Cancel</button>
                <button id="createRestBtn" type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? '⏳ Creating...' : '🏪 Create Restaurant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
