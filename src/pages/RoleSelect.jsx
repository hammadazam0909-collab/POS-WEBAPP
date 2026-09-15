import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function RoleSelect() {
  const { restaurant, loginAsKitchen, logout } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (restaurant && restaurant.businessType === 'retail') {
      navigate('/pin');
    }
  }, [restaurant, navigate]);

  if (!restaurant) { navigate('/'); return null; }
  
  if (restaurant.businessType === 'retail') {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    );
  }

  function handleOwner() {
    navigate('/pin');
  }

  function handleKitchen() {
    loginAsKitchen();
    navigate('/kitchen');
  }

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
      </div>

      <div className="auth-container" style={{ maxWidth: 520 }}>
        {/* Brand */}
        <div className="auth-brand">
          <div style={{ width: '100%', textAlign: 'center', marginBottom: 0 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 100, height: 'auto', paddingTop: '60px' }} />
          </div>
          <h1 className="auth-title">POSparrow</h1>
          <p className="auth-subtitle">SMART POS | SIMPLE OPERATIONS | BETTER RESTAURANTS</p>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-card-icon">🏪</span>
            <h2>{restaurant.name}</h2>
            <p>Select how you want to access the system</p>
          </div>

          <div className="role-grid">
            <button id="ownerBtn" className="role-card" onClick={handleOwner}>
              <div className="role-card-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                👑
              </div>
              <h3>Owner</h3>
              <p>Full access to manage orders, tables & reports</p>
              <span className="badge badge-warning">PIN Required</span>
            </button>

            <button id="kitchenBtn" className="role-card" onClick={handleKitchen}>
              <div className="role-card-icon" style={{ background: 'rgba(16,185,129,0.15)' }}>
                🍳
              </div>
              <h3>Kitchen Staff</h3>
              <p>View & manage incoming orders from the kitchen</p>
              <span className="badge badge-success">Direct Access</span>
            </button>
          </div>

          <div className="auth-divider" style={{ marginTop: 24 }}><span>or</span></div>

          <button
            id="backBtn"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { logout(); navigate('/'); }}
          >
            ← Back to Restaurant Login
          </button>
        </div>
      </div>
    </div>
  );
}
