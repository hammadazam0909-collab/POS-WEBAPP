import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../owner/Owner.css';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/dashboard/restaurants', label: 'Restaurants', icon: '🏪' },
  { to: '/admin/dashboard/plans', label: 'Subscription Plans', icon: '💳' },
  { to: '/admin/dashboard/promotions', label: 'Promotions', icon: '🎁' },
  { to: '/admin/dashboard/history', label: 'Payment History', icon: '📜' },
  { to: '/admin/dashboard/create', label: 'Add Restaurant', icon: '➕' },
];

export default function AdminLayout() {
  const { adminUser, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function closeSidebar() { setSidebarOpen(false); }

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} style={{ borderRight: '1px solid rgba(59,130,246,0.15)' }}>
        <button className="sidebar-close-btn" onClick={closeSidebar} aria-label="Close menu">✕</button>

        <div className="sidebar-brand">
          <div className="sidebar-logo" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>AR</div>
          <div>
            <div className="sidebar-name">AR POS</div>
            <div className="sidebar-rest">Admin Panel</div>
          </div>
        </div>

        <div className="sidebar-divider" />
        <div style={{ padding: '0 16px 12px' }}>
          <span className="badge badge-info" style={{ width: '100%', justifyContent: 'center' }}>🔐 Super Admin</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} id={`adminNav-${item.label}`}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              style={({ isActive }) => isActive ? { borderLeftColor: '#3b82f6', color: '#3b82f6', background: 'rgba(59,130,246,0.1)' } : {}}
              onClick={closeSidebar}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ flex: 1 }} />
        <div className="sidebar-divider" />
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{adminUser?.email}</div>
          <button id="adminLogoutBtn" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { logout(); navigate('/admin'); }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {/* Mobile top header */}
        <div className="mobile-header">
          <button className="mobile-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>
          <div className="mobile-header-brand">
            <div className="sidebar-logo" style={{ width: 32, height: 32, fontSize: '0.75rem', background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>AR</div>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>AR POS Admin</span>
          </div>
          <div style={{ width: 40 }} />
        </div>

        <Outlet />

        {/* Mobile bottom nav for admin */}
        <nav className="mobile-bottom-nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `mobile-bottom-link ${isActive ? 'active' : ''}`}
            >
              <span className="mobile-bottom-icon">{item.icon}</span>
              <span className="mobile-bottom-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}
