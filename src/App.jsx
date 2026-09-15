import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';

// Pages
import RestaurantLogin from './pages/RestaurantLogin';
import RoleSelect from './pages/RoleSelect';
import PinEntry from './pages/PinEntry';
import AdminLogin from './pages/admin/AdminLogin';

// Owner pages
// Restaurant Owner Layout / Pages
import RestaurantOwnerLayout from './pages/owner/restaurant/OwnerLayout';
import RestaurantOwnerDashboard from './pages/owner/restaurant/OwnerDashboard';
import RestaurantTakeaway from './pages/owner/restaurant/Takeaway';
import RestaurantMenuManager from './pages/owner/restaurant/MenuManager';

// Retail Owner Layout / Pages
import RetailLayout from './pages/owner/retail/RetailLayout';
import RetailDashboard from './pages/owner/retail/RetailDashboard';
import POSCheckout from './pages/owner/retail/POSCheckout';
import ProductManager from './pages/owner/retail/ProductManager';

// Shared Pages
import Tables from './pages/owner/Tables';
import Orders from './pages/owner/Orders';
import Delivery from './pages/owner/Delivery';
import OrderHistory from './pages/owner/OrderHistory';
import Analytics from './pages/owner/Analytics';
import Settings from './pages/owner/Settings';
import Inventory from './pages/owner/Inventory';
import Staff from './pages/owner/Staff';
import Vendors from './pages/owner/Vendors';

// Kitchen
import KitchenDisplay from './pages/kitchen/KitchenDisplay';

// Admin
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import RestaurantManager from './pages/admin/RestaurantManager';
import CreateRestaurant from './pages/admin/CreateRestaurant';
import SubscriptionPlans from './pages/admin/SubscriptionPlans';
import Promotions from './pages/admin/Promotions';
import PaymentHistory from './pages/admin/PaymentHistory';

function ProtectedOwner({ children }) {
  const { restaurant, role } = useAuth();
  if (!restaurant) return <Navigate to="/" replace />;
  if (role !== 'owner') return <Navigate to="/select-role" replace />;
  return children;
}

function ProtectedKitchen({ children }) {
  const { restaurant, role } = useAuth();
  if (!restaurant) return <Navigate to="/" replace />;
  if (role !== 'kitchen') return <Navigate to="/select-role" replace />;
  
  // Check if Kitchen Display is allowed in subscription
  const isAllowed = !restaurant.allowedPages || restaurant.allowedPages.includes('orders');
  if (!isAllowed) {
    alert("Kitchen Display (KDS) & Active Orders are not included in your current subscription plan. Please upgrade to use this feature.");
    return <Navigate to="/select-role" replace />;
  }
  
  return children;
}

function ProtectedAdmin({ children }) {
  const { role } = useAuth();
  if (role !== 'admin') return <Navigate to="/admin" replace />;
  return children;
}

function ProtectedPage({ permission, children }) {
  const { restaurant } = useAuth();
  const isAllowed = !restaurant?.allowedPages || restaurant.allowedPages.includes(permission);
  
  if (!isAllowed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px', maxWidth: 400, border: '2px dashed var(--border)' }}>
           <div style={{ fontSize: '4rem', marginBottom: 20 }}>🔒</div>
           <h2 style={{ marginBottom: 10 }}>Feature Locked</h2>
           <p style={{ color: 'var(--text-secondary)', marginBottom: 25 }}>
             The <strong>{permission.charAt(0).toUpperCase() + permission.slice(1)}</strong> module is not included in your current subscription plan.
           </p>
           <button className="btn btn-primary" onClick={() => window.location.href = 'https://wa.me/923224776071'}>
             Upgrade Plan to Unlock
           </button>
        </div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  const { loading, restaurant } = useAuth();
  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    );
  }

  const isRetail = restaurant?.businessType === 'retail';

  return (
    <Routes>
      {/* Restaurant Auth Flow */}
      <Route path="/" element={<RestaurantLogin />} />
      <Route path="/select-role" element={<RoleSelect />} />
      <Route path="/pin" element={<PinEntry />} />

      {/* Owner Portal */}
      <Route path="/owner" element={
        <ProtectedOwner>
          {isRetail ? <RetailLayout /> : <RestaurantOwnerLayout />}
        </ProtectedOwner>
      }>
        <Route index element={
          <ProtectedPage permission="dashboard">
            {isRetail ? <RetailDashboard /> : <RestaurantOwnerDashboard />}
          </ProtectedPage>
        } />
        {!isRetail && (
          <>
            <Route path="tables" element={<ProtectedPage permission="tables"><Tables /></ProtectedPage>} />
            <Route path="orders" element={<ProtectedPage permission="orders"><Orders /></ProtectedPage>} />
            <Route path="delivery" element={<ProtectedPage permission="delivery"><Delivery /></ProtectedPage>} />
          </>
        )}
        <Route path="takeaway" element={
          <ProtectedPage permission="takeaway">
            {isRetail ? <POSCheckout /> : <RestaurantTakeaway />}
          </ProtectedPage>
        } />
        <Route path="menu" element={
          <ProtectedPage permission="menu">
            {isRetail ? <ProductManager /> : <RestaurantMenuManager />}
          </ProtectedPage>
        } />
        <Route path="inventory" element={<ProtectedPage permission="inventory"><Inventory /></ProtectedPage>} />
        <Route path="vendors" element={<ProtectedPage permission="vendors"><Vendors /></ProtectedPage>} />
        <Route path="staff" element={<ProtectedPage permission="staff"><Staff /></ProtectedPage>} />
        <Route path="history" element={<ProtectedPage permission="history"><OrderHistory /></ProtectedPage>} />
        <Route path="analytics" element={<ProtectedPage permission="analytics"><Analytics /></ProtectedPage>} />
        <Route path="settings" element={<ProtectedPage permission="settings"><Settings /></ProtectedPage>} />
      </Route>

      {/* Kitchen Portal */}
      <Route path="/kitchen" element={<ProtectedKitchen><KitchenDisplay /></ProtectedKitchen>} />

      {/* Admin Portal */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<ProtectedAdmin><AdminLayout /></ProtectedAdmin>}>
        <Route index element={<AdminDashboard />} />
        <Route path="restaurants" element={<RestaurantManager />} />
        <Route path="plans" element={<SubscriptionPlans />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="history" element={<PaymentHistory />} />
        <Route path="create" element={<CreateRestaurant />} />
      </Route>
      {/* Redirect /admin/dashboard/restaurants links */}
      <Route path="/admin/dashboard/restaurants" element={<ProtectedAdmin><AdminLayout /></ProtectedAdmin>}>
        <Route index element={<RestaurantManager />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
