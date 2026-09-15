import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useOrders } from '../../../hooks/useFirestore';
import { useSettings } from '../../../context/SettingsContext';
import { db } from '../../../firebase/config';
import { collection, getDocs, onSnapshot, doc } from 'firebase/firestore';
import '../Owner.css';

function isRestaurantClosed(openTime, closeTime) {
  if (!openTime || !closeTime) return false;
  const now = new Date();
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);

  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  const currentMins = now.getHours() * 60 + now.getMinutes();

  if (closeMins < openMins) {
    if (currentMins >= closeMins && currentMins < openMins) {
      return true;
    }
  } else {
    if (currentMins < openMins || currentMins >= closeMins) {
      return true;
    }
  }
  return false;
}

const NAV = [
  { to: '/owner', label: 'Dashboard', icon: '📊', end: true },
  { to: '/owner/takeaway', label: 'POS Checkout', icon: '🛒' },
  { to: '/owner/menu', label: 'Products', icon: '📦' },
  { to: '/owner/inventory', label: 'Inventory', icon: '🏪' },
  { to: '/owner/vendors', label: 'Vendors', icon: '🤝' },
  { to: '/owner/staff', label: 'Staff', icon: '👥' },
  { to: '/owner/history', label: 'History', icon: '📜' },
  { to: '/owner/analytics', label: 'Analytics', icon: '📈' },
  { to: '/owner/settings', label: 'Settings', icon: '⚙️' },
];

const BOTTOM_NAV = NAV.slice(0, 5);

export default function RetailLayout() {
  const { restaurant, logout } = useAuth();
  const { hasPendingWrites } = useOrders();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [paymentAlert, setPaymentAlert] = useState(null);
  const [liveRestaurant, setLiveRestaurant] = useState(restaurant);

  useEffect(() => {
    if (!restaurant?.id) return;
    const unsubRest = onSnapshot(doc(db, 'restaurants', restaurant.id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveRestaurant({ id: snap.id, ...data });
      }
    });
    return unsubRest;
  }, [restaurant?.id]);

  useEffect(() => {
    async function fetchData() {
      if (!liveRestaurant) return;
      try {
        const plansSnap = await getDocs(collection(db, 'subscription_plans'));
        const pData = plansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPlans(pData);
        
        const promosSnap = await getDocs(collection(db, 'promotions'));
        const prData = promosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPromotions(prData);

        const currentPromo = prData.find(p => p.isActive);
        if (currentPromo && liveRestaurant) {
          const promotedPlan = pData.find(p => p.id === currentPromo.planId);
          const userPlan = pData.find(p => p.id === liveRestaurant.planId);
          
          if (promotedPlan && userPlan && liveRestaurant.planId !== currentPromo.planId) {
            const promotedPrice = Number(promotedPlan.amount) || 0;
            const userPrice = Number(userPlan.amount) || 0;
            
            if (promotedPrice > userPrice) {
              setActivePromo(currentPromo);
              setPromoPopupOpen(true);
            }
          }
        }

        if (liveRestaurant?.paymentDueDate) {
          const due = new Date(liveRestaurant.paymentDueDate);
          due.setHours(0,0,0,0);
          
          const today = new Date();
          today.setHours(0,0,0,0);
          
          const diffTime = due.getTime() - today.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            setPaymentAlert({ type: 'overdue', days: Math.abs(diffDays) });
          } else if (diffDays <= 3) {
            setPaymentAlert({ type: 'near', days: diffDays });
          } else {
            setPaymentAlert(null);
          }
        } else {
          setPaymentAlert(null);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    }
    fetchData();
  }, [liveRestaurant]);

  function handleLogout() {
    logout();
    navigate('/');
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  if (paymentAlert?.type === 'overdue') {
    return (
      <div style={{ 
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        background: 'var(--bg-primary)', zIndex: 9999, display: 'flex', 
        alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
        <div className="modal" style={{ maxWidth: 450, textAlign: 'center', border: '2px solid var(--danger)', padding: '40px 30px', animation: 'popIn 0.5s ease' }}>
          <div style={{ fontSize: '5.5rem', marginBottom: 20 }}>🚫</div>
          <h2 style={{ color: 'var(--danger-light)', marginBottom: 15, fontSize: '2.2rem' }}>Access Restricted</h2>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: 25, lineHeight: 1.6 }}>
            Your subscription expired on <strong>{restaurant?.paymentDueDate}</strong>.<br/>
            Please clear your dues immediately to restore access to your retail shop's POS system.
          </p>
          <div style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: 20, border: '1px solid var(--border)', marginBottom: 30, boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)' }}>
             <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 6 }}>Total Amount Due</div>
             <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>Rs {(restaurant?.customPlanPrice || plans.find(p => p.id === restaurant?.planId)?.amount || 0).toLocaleString()}</div>
          </div>
          <a href={`https://wa.me/923224776071?text=Hi! I want to clear dues for retail ID: *${restaurant?.id}*`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', padding: '18px', borderRadius: 16, background: 'var(--danger)', color: '#fff', borderColor: 'transparent', fontWeight: 900, fontSize: '1.2rem', textDecoration: 'none', display: 'block', boxShadow: '0 10px 20px rgba(239, 68, 68, 0.3)' }}>
            PAY NOW TO UNLOCK 🚀
          </a>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: 25, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>
            Logout from account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <button className="sidebar-close-btn" onClick={closeSidebar} aria-label="Close menu">
          ✕
        </button>

        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="sidebar-name">POSparrow</div>
            <div className="sidebar-rest">{restaurant?.name}</div>
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasPendingWrites ? 'var(--warning)' : 'var(--success)', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{hasPendingWrites ? 'Syncing...' : 'Cloud Synced'}</span>
            </div>
          </div>
        </div>

        <div className="sidebar-divider" />

        <div style={{ padding: '0 16px 12px' }}>
          <span className="badge badge-success" style={{ width: '100%', justifyContent: 'center' }}>
            🛍️ Retail Portal
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => {
            const pageId = item.label === 'POS Checkout' ? 'takeaway' : (item.label === 'Products' ? 'menu' : item.label.toLowerCase());
            const isAllowed = !restaurant?.allowedPages || restaurant.allowedPages.includes(pageId);

            return (
              <NavLink
                key={item.to}
                to={isAllowed ? item.to : '#'}
                end={item.end}
                id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                className={({ isActive }) => `sidebar-link ${isActive && isAllowed ? 'active' : ''} ${!isAllowed ? 'disabled-link' : ''}`}
                style={!isAllowed ? { opacity: 0.6 } : {}}
                onClick={(e) => {
                  if (!isAllowed) {
                    e.preventDefault();
                    setUpgradeModalOpen(true);
                    return;
                  }
                  if (item.label === 'POS Checkout' && isRestaurantClosed(settings?.openTime, settings?.closeTime)) {
                    e.preventDefault();
                    alert('Business closed! Cannot punch order.');
                    return;
                  }
                  closeSidebar();
                }}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {!isAllowed && <span style={{ fontSize: '0.8rem' }}>🔒</span>}
              </NavLink>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />
        <div className="sidebar-divider" />

        <div style={{ padding: '12px 16px' }}>
          <button id="logoutBtn" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogout}>
            🚪 Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-header">
          <button
            className="mobile-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span /><span /><span />
          </button>
          <div className="mobile-header-brand">
            <div className="sidebar-logo" style={{ width: 32, height: 32 }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>POSparrow</span>
          </div>
          <div style={{ width: 40 }} />
        </div>

        <Outlet />

        <nav className="mobile-bottom-nav">
          {BOTTOM_NAV.map(item => {
            const pageId = item.label === 'POS Checkout' ? 'takeaway' : (item.label === 'Products' ? 'menu' : item.label.toLowerCase());
            const isAllowed = !restaurant?.allowedPages || restaurant.allowedPages.includes(pageId);

            return (
              <NavLink
                key={item.to}
                to={isAllowed ? item.to : '#'}
                end={item.end}
                className={({ isActive }) => `mobile-bottom-link ${isActive && isAllowed ? 'active' : ''}`}
                style={!isAllowed ? { opacity: 0.5 } : {}}
                onClick={(e) => {
                  if (!isAllowed) {
                    e.preventDefault();
                    setUpgradeModalOpen(true);
                    return;
                  }
                  if (item.label === 'POS Checkout' && isRestaurantClosed(settings?.openTime, settings?.closeTime)) {
                    e.preventDefault();
                    alert('Business closed! Cannot punch order.');
                  }
                }}
              >
                <span className="mobile-bottom-icon">
                  {item.icon}
                  {!isAllowed && <span style={{ position: 'absolute', top: -5, right: -5, fontSize: '0.6rem', background: 'rgba(0,0,0,0.5)', borderRadius: '50%' }}>🔒</span>}
                </span>
                <span className="mobile-bottom-label">{item.label}</span>
              </NavLink>
            );
          })}
          <button
            className="mobile-bottom-link"
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="mobile-bottom-icon">☰</span>
            <span className="mobile-bottom-label">More</span>
          </button>
        </nav>
      </main>

      {upgradeModalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUpgradeModalOpen(false)}>
          <div className="modal modal-xl" style={{ maxWidth: 800, padding: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)', padding: '16px 20px', textAlign: 'center', color: '#fff', position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setUpgradeModalOpen(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🚀</div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>Upgrade Your Subscription</h2>
              <p style={{ margin: '2px 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>Unlock premium features to grow your business</p>
            </div>
            
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {plans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading plans...</div>
              ) : (() => {
                  const visiblePlans = plans.filter(p => !p.name?.toLowerCase().includes('promotion'));
                  return (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: visiblePlans.length <= 3 ? `repeat(${visiblePlans.length}, 1fr)` : 'repeat(auto-fit, minmax(240px, 1fr))', 
                      gap: 20,
                      minWidth: visiblePlans.length > 2 ? '700px' : 'auto' 
                    }}>
                      {[...visiblePlans].sort((a, b) => {
                        const aEnt = a.name.toLowerCase().includes('enterprise');
                        const bEnt = b.name.toLowerCase().includes('enterprise');
                        if (aEnt && !bEnt) return 1;
                        if (!aEnt && bEnt) return -1;
                        return 0;
                      }).map(plan => {
                        const isEnterprise = plan.name.toLowerCase().includes('enterprise');
                        const hasAllFeatures = (plan.allowedPages || []).every(p => (restaurant?.allowedPages || []).includes(p));
                        const isCurrent = plan.id === restaurant?.planId && hasAllFeatures;
                        const isCustom = plan.id === restaurant?.planId && restaurant?.customPlanPrice;

                        return (
                          <div key={plan.id} style={{ 
                            border: '2px solid var(--border)', 
                            borderRadius: 12, 
                            padding: 20, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            background: isCurrent ? 'var(--bg-lighter)' : 'var(--bg-card)', 
                            position: 'relative',
                            boxShadow: isEnterprise ? '0 0 20px rgba(99, 102, 241, 0.2)' : 'none',
                            borderColor: isCurrent ? 'var(--success)' : (isCustom ? 'var(--accent)' : (isEnterprise ? 'var(--accent)' : 'var(--border)'))
                          }}>
                            {isCurrent ? (
                              <div style={{ 
                                position: 'absolute', 
                                top: 8, 
                                right: 8, 
                                background: 'var(--success)', 
                                color: '#fff', 
                                padding: '2px 8px', 
                                borderRadius: 4, 
                                fontSize: '0.6rem', 
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>Active</div>
                            ) : isCustom ? (
                              <div style={{ 
                                position: 'absolute', 
                                top: 8, 
                                right: 8, 
                                background: 'var(--accent)', 
                                color: '#000', 
                                padding: '2px 8px', 
                                borderRadius: 4, 
                                fontSize: '0.6rem', 
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>Special Offer</div>
                            ) : null}
                            <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textAlign: 'center' }}>{plan.name}</h3>
                            {(() => {
                              const promo = promotions.find(p => p.planId === plan.id && p.isActive);
                              const basePrice = isCustom ? restaurant.customPlanPrice : plan.amount;
                              let finalPrice = basePrice;
                              
                              if (promo && !isCustom) {
                                if (promo.discountType === 'percentage') {
                                  finalPrice = basePrice * (1 - promo.discountValue / 100);
                                } else {
                                  finalPrice = basePrice - promo.discountValue;
                                }
                              }
                              
                              return (
                                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                  {isCustom ? (
                                    <>
                                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>Rs {Number(plan.amount).toLocaleString()}</div>
                                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>
                                        Rs {Number(finalPrice).toLocaleString()}
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>⭐ Exclusive Rate for You</div>
                                    </>
                                  ) : promo ? (
                                    <>
                                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>Rs {Number(plan.amount).toLocaleString()}</div>
                                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--success-light)' }}>
                                        Rs {Number(finalPrice).toLocaleString()}
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>🔥 {promo.name}</div>
                                    </>
                                  ) : (
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>
                                      Rs {Number(plan.amount).toLocaleString()}
                                      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>Includes:</div>
                              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {(plan.allowedPages || []).map(pId => {
                                  const lbl = [
                                    { id: 'dashboard', label: 'Dashboard' }, { id: 'takeaway', label: 'POS Checkout' },
                                    { id: 'menu', label: 'Product Manager' }, { id: 'inventory', label: 'Inventory Sync' }, 
                                    { id: 'vendors', label: 'Vendor Management' }, { id: 'staff', label: 'Staff Management' },
                                    { id: 'history', label: 'Order History' }, { id: 'analytics', label: 'Analytics' },
                                    { id: 'settings', label: 'Settings' }
                                  ].find(x => x.id === pId)?.label || pId;
                                  return (
                                    <li key={pId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.9rem' }}>
                                      <span style={{ color: 'var(--success-light)' }}>✓</span> {lbl}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              }
            </div>

            <div style={{ background: 'var(--bg-glass)', borderTop: '1px solid var(--border)', padding: '12px 20px', textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>Ready to upgrade? Contact us to activate!</div>
              <a href={`https://wa.me/923224776071?text=Hi! I want to upgrade my POSparrow subscription for retail ID: *${restaurant?.id}*`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', textDecoration: 'none', padding: '8px 20px', borderRadius: 50, fontWeight: 700, fontSize: '0.9rem', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-5.824 4.74-10.563 10.564-10.563 5.826 0 10.564 4.738 10.564 10.561s-4.738 10.565-10.564 10.565z"/>
                </svg>
                Chat on WhatsApp
              </a>
              <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Or call us at +92 322 4776071</div>
            </div>
          </div>
        </div>
      )}

      {paymentAlert && paymentAlert.type === 'near' && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 2000, background: 'rgba(0,0,0,0.7)' }}
          onClick={e => {
            if (e.target === e.currentTarget) setPaymentAlert(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 420, textAlign: 'center', border: '2px solid var(--warning)', animation: 'popIn 0.4s ease', position: 'relative' }}>
            <button onClick={() => setPaymentAlert(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            <div style={{ fontSize: '4.5rem', marginBottom: 15 }}>⏳</div>
            <h2 style={{ color: 'var(--warning)', marginBottom: 10, fontSize: '1.8rem' }}>Payment Due Soon</h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              Your subscription is nearing its end ({restaurant?.paymentDueDate}). Please clear your dues within the next {paymentAlert.days} day(s) to avoid any interruption.
            </p>
            <div style={{ background: 'var(--bg-lighter)', padding: '20px', borderRadius: 16, border: '1px solid var(--border)', marginBottom: 24 }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Amount Payable</div>
               <div style={{ fontSize: '2rem', fontWeight: 900 }}>Rs {(restaurant?.customPlanPrice || plans.find(p => p.id === restaurant?.planId)?.amount || 0).toLocaleString()}</div>
            </div>
            <a href={`https://wa.me/923224776071?text=Hi! I want to clear dues for retail ID: *${restaurant?.id}*`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'var(--warning)', color: '#000', borderColor: 'transparent', fontWeight: 800, fontSize: '1.1rem', textDecoration: 'none', display: 'block' }}>
              CLEAR DUES NOW
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
