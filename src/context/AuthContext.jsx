import React, { createContext, useContext, useState, useEffect } from 'react';

import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const firebaseAuth = { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut };
const firebaseDb = { db, doc, getDoc };

async function getFirebase() {
  return { firebaseAuth, firebaseDb };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null);
  const [restaurant, setRestaurant] = useState(() => {
    const saved = sessionStorage.getItem('arpos_restaurant');
    return saved ? JSON.parse(saved) : null;
  });
  const [role, setRole] = useState(() => sessionStorage.getItem('arpos_role') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Try Firebase admin auth listener
    getFirebase().then(({ firebaseAuth: fa }) => {
      if (!fa) { setLoading(false); return; }
      const unsub = fa.onAuthStateChanged(fa.auth, async (user) => {
        if (user) {
          try {
            const { firebaseDb: fd } = await getFirebase();
            const snap = await fd.getDoc(fd.doc(fd.db, 'admins', user.uid));
            if (snap.exists()) {
              setAdminUser({ uid: user.uid, email: user.email, ...snap.data() });
              setRole('admin');
            }
          } catch {}
        }
        setLoading(false);
      });
      return unsub;
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!restaurant?.id) return;
    let unsub;
    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { doc, onSnapshot, getDoc } = await import('firebase/firestore');
        unsub = onSnapshot(doc(db, 'restaurants', restaurant.id), async snap => {
          if (snap.exists()) {
            const data = snap.data();
            let allowedPages = data.allowedPages || [];

            if (data.planId) {
              try {
                const planSnap = await getDoc(doc(db, 'subscription_plans', data.planId));
                if (planSnap.exists()) {
                  const planData = planSnap.data();
                  if (planData.allowedPages) {
                    allowedPages = planData.allowedPages;
                  }
                }
              } catch (planErr) {
                console.error("Error fetching plan in auth context:", planErr);
              }
            }

            const restData = { id: restaurant.id, ...data, allowedPages };
            setRestaurant(restData);
            sessionStorage.setItem('arpos_restaurant', JSON.stringify(restData));
          }
        });
      } catch (err) {
        console.error("Error setting up restaurant snapshot listener:", err);
      }
    })();
    return () => unsub?.();
  }, [restaurant?.id]);

  async function adminLogin(email, password) {
    const { firebaseAuth: fa, firebaseDb: fd } = await getFirebase();
    if (!fa) throw new Error('Firebase not configured. Please set up Firebase credentials.');
    const cred = await fa.signInWithEmailAndPassword(fa.auth, email, password);
    const snap = await fd.getDoc(fd.doc(fd.db, 'admins', cred.user.uid));
    if (!snap.exists()) throw new Error('Not an admin account');
    setAdminUser({ uid: cred.user.uid, email: cred.user.email, ...snap.data() });
    setRole('admin');
    return cred;
  }

  async function restaurantLogin(restaurantId, password) {

    const { firebaseDb: fd } = await getFirebase();
    if (!fd) throw new Error('Firebase not configured. Please set up Firebase credentials.');

    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(fd.db, 'restaurants', restaurantId));
    if (!snap.exists()) throw new Error('Restaurant not found');
    const data = snap.data();
    if (data.password !== password) throw new Error('Invalid password');
    if (data.status === 'blocked') {
      throw new Error(`Account blocked: ${data.blockedReason || 'Contact admin for details'}`);
    }
    const restData = { id: restaurantId, ...data };
    setRestaurant(restData);
    sessionStorage.setItem('arpos_restaurant', JSON.stringify(restData));
    return restData;
  }

  async function verifyOwnerPin(pin) {
    if (!restaurant) throw new Error('No restaurant session');


    // Firebase mode
    const { firebaseDb: fd } = await getFirebase();
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(fd.db, 'restaurants', restaurant.id));
    const data = snap.data();
    if (data.ownerPin !== pin) throw new Error('Incorrect PIN');
    setRole('owner');
    sessionStorage.setItem('arpos_role', 'owner');
  }

  function loginAsKitchen() {
    setRole('kitchen');
    sessionStorage.setItem('arpos_role', 'kitchen');
  }

  function logout() {
    if (role === 'admin' && firebaseAuth) {
      firebaseAuth.signOut(firebaseAuth.auth).catch(() => {});
      setAdminUser(null);
    }
    setRestaurant(null);
    setRole(null);
    sessionStorage.removeItem('arpos_restaurant');
    sessionStorage.removeItem('arpos_role');
  }

  return (
    <AuthContext.Provider value={{
      adminUser, restaurant, role, loading,
      adminLogin, restaurantLogin, verifyOwnerPin, loginAsKitchen, logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
