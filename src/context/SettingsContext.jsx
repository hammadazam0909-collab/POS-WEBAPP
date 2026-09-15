import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase/config';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const DEFAULT_SETTINGS = {
  pinEnabled: false,
  pin: '1234',
  theme: 'dark',           // 'dark' | 'light'
  taxRate: 5,              // percent
  currency: 'Rs',
  autoKitchenPrint: true,
  pinUnlockMinutes: 5,     // how long pin stays unlocked after verification
  invoiceText: '',         // custom text shown at bottom of all bills
  openTime: '11:00',       // default open time
  closeTime: '04:00',      // default close time
  orderTakers: [],         // list of order takers for takeaway
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const auth = useAuth();
  const restaurant = auth?.restaurant;
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Track when PIN was last verified (timestamp)
  const [pinVerifiedAt, setPinVerifiedAt] = useState(null);

  // Fetch settings from Firestore
  useEffect(() => {
    if (!restaurant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, 'restaurants', restaurant.id, 'settings', 'general');
    
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...snapshot.data() });
      } else {
        // Create default settings if not exists
        setDoc(docRef, DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [restaurant]);

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === 'light') {
      html.classList.add('light-theme');
    } else {
      html.classList.remove('light-theme');
    }
  }, [settings.theme]);

  const updateSetting = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    if (restaurant) {
      const docRef = doc(db, 'restaurants', restaurant.id, 'settings', 'general');
      await setDoc(docRef, { [key]: value }, { merge: true });
    }
  };

  const updateSettings = async (patch) => {
    const newSettings = { ...settings, ...patch };
    setSettings(newSettings);
    if (restaurant) {
      const docRef = doc(db, 'restaurants', restaurant.id, 'settings', 'general');
      await setDoc(docRef, patch, { merge: true });
    }
  };

  // Check if currently unlocked
  const isPinUnlocked = useCallback(() => {
    if (!settings.pinEnabled) return true;
    if (!pinVerifiedAt) return false;
    const elapsed = (Date.now() - pinVerifiedAt) / 1000 / 60;
    return elapsed < settings.pinUnlockMinutes;
  }, [settings.pinEnabled, settings.pinUnlockMinutes, pinVerifiedAt]);

  function verifyPin(entered) {
    if (entered === settings.pin) {
      setPinVerifiedAt(Date.now());
      return true;
    }
    return false;
  }

  function lockPin() {
    setPinVerifiedAt(null);
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSetting,
      updateSettings,
      isPinUnlocked,
      verifyPin,
      lockPin,
      loading,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
