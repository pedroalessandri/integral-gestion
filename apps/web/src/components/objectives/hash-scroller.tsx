'use client';

import { useEffect } from 'react';

export function HashScroller() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('hash-highlight');
    const t = setTimeout(() => el.classList.remove('hash-highlight'), 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
