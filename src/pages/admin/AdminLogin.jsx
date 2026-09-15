import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../Auth.css';

export default function AdminLogin() {
  const { adminLogin, role } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [role, navigate]);

  if (role === 'admin') return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin(email, password);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" style={{ background: '#3b82f6' }} />
        <div className="auth-orb auth-orb-2" style={{ background: '#6366f1' }} />
      </div>

      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
            <span>AR</span>
          </div>
          <h1 className="auth-title" style={{ background: 'linear-gradient(135deg, #fff, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Admin Panel
          </h1>
          <p className="auth-subtitle">AR POS Management System</p>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-card-icon">🔐</span>
            <h2>Admin Login</h2>
            <p>Restricted access — authorized personnel only</p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Email</label>
              <input id="adminEmail" className="input" type="email" placeholder="admin@arpos.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input id="adminPassword" className="input" type="password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button id="adminLoginBtn" className="btn btn-lg" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none' }}>
              {loading ? <><div className="spinner-sm" style={{ borderTopColor: '#fff' }} /> Verifying...</> : '🔐 Login as Admin'}
            </button>
          </form>

          <div className="auth-divider"><span>restaurant?</span></div>
          <button id="backToRestaurant" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/')}>
            ← Restaurant Login
          </button>
        </div>
      </div>
    </div>
  );
}
