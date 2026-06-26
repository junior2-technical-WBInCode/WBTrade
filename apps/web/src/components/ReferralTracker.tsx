'use client';

/**
 * Referral Tracker Component
 * 
 * Captures '?ref=CODE' from URL and stores it in cookies and localStorage.
 * Keeps track of:
 * - 'ref_last_click': the most recently clicked referral code
 * - 'ref_touched': list of all unique referral codes clicked within the last 30 days
 * 
 * Reports the click to the backend click tracking endpoint.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';

const COOKIE_EXPIRY_DAYS = 30;

export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (!refCode) return;

    const trimmedCode = refCode.trim().toUpperCase();
    if (!trimmedCode) return;

    // 1. Save last click in cookie & localStorage
    Cookies.set('ref_last_click', trimmedCode, { expires: COOKIE_EXPIRY_DAYS, path: '/' });
    localStorage.setItem('ref_last_click', trimmedCode);

    // 2. Save/update touched list in cookie & localStorage
    let touched: string[] = [];
    try {
      const storedTouched = localStorage.getItem('ref_touched');
      if (storedTouched) {
        touched = JSON.parse(storedTouched);
      }
    } catch {
      touched = [];
    }

    if (!Array.isArray(touched)) {
      touched = [];
    }

    // Add code to list (remove duplicates first to make it the most recent one)
    touched = touched.filter((code) => code !== trimmedCode);
    touched.unshift(trimmedCode); // Put at the beginning (most recent click)
    
    // Limit list to last 20 links to avoid huge header/cookie sizes
    touched = touched.slice(0, 20);

    const touchedStr = JSON.stringify(touched);
    Cookies.set('ref_touched', touchedStr, { expires: COOKIE_EXPIRY_DAYS, path: '/' });
    localStorage.setItem('ref_touched', touchedStr);

    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
    const cleanUrl = API_URL.endsWith('/api') ? `${API_URL}/referrals/click` : `${API_URL}/api/referrals/click`;
    fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmedCode }),
    }).catch((err) => {
      console.warn('[ReferralTracker] Click registration failed:', err);
    });

    console.log(`[ReferralTracker] Click registered: code=${trimmedCode}, touchedCount=${touched.length}`);
  }, [searchParams]);

  return null; // Invisible utility component
}

/**
 * Get active referral payload for checkout submission.
 * Reads from cookies first (for SSR compatibility if needed) or localStorage.
 */
export function getReferralData(): { lastClick: string; touched: string[] } | null {
  if (typeof window === 'undefined') return null;

  const lastClick = Cookies.get('ref_last_click') || localStorage.getItem('ref_last_click');
  if (!lastClick) return null;

  let touched: string[] = [];
  try {
    const rawTouched = Cookies.get('ref_touched') || localStorage.getItem('ref_touched');
    if (rawTouched) {
      touched = JSON.parse(rawTouched);
    }
  } catch {
    touched = [];
  }

  // Fallback: if touched list is empty but we have lastClick, make it the only item
  if (!Array.isArray(touched) || touched.length === 0) {
    touched = [lastClick];
  }

  return {
    lastClick,
    touched,
  };
}

/**
 * Clear referral data after successful checkout.
 */
export function clearReferralData() {
  if (typeof window === 'undefined') return;
  Cookies.remove('ref_last_click', { path: '/' });
  Cookies.remove('ref_touched', { path: '/' });
  localStorage.removeItem('ref_last_click');
  localStorage.removeItem('ref_touched');
}
