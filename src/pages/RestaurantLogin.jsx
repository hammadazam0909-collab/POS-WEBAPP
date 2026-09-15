import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function RestaurantLogin() {
  const { restaurantLogin, restaurant } = useAuth();
  const navigate = useNavigate();
  const [restaurantId, setRestaurantId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in → redirect
  useEffect(() => {
    if (restaurant) {
      navigate('/select-role');
    }
  }, [restaurant, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await restaurantLogin(restaurantId.trim(), password);
      navigate('/select-role');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root">
      {/* Animated background */}
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <div className="auth-container">
        {/* Brand */}
        <div className="auth-brand">
          <div style={{ width: '100%', textAlign: 'center', marginBottom: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 100, height: 'auto', paddingTop: '60px' }} />
          </div>
          <h1 className="auth-title">POSparrow</h1>
        </div>

        {/* Card */}
        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-card-icon">🏪</span>
            <h2>Restaurant Login</h2>
            <p>Enter your restaurant credentials to continue</p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              <span>⚠️</span> {error}
            </div>
          )}


          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Restaurant ID</label>
              <input
                className="input"
                id="restaurantId"
                type="text"
                placeholder="e.g. rest_001"
                value={restaurantId}
                onChange={e => setRestaurantId(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                className="input"
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              id="loginBtn"
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? <><div className="spinner-sm" /> Verifying...</> : '🚀 Continue'}
            </button>
          </form>

          <div className="auth-divider">
            <span>Admin?</span>
          </div>

          <button
            id="adminLoginLink"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/admin')}
          >
            🔐 Admin Panel
          </button>
        </div>

        <p className="auth-footer">© 2026 AR POS — All rights reserved</p>
      </div>
    </div>
  );
}
