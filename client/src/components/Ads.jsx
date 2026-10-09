import { useEffect, useRef } from 'react';

// Google AdSense slot. Renders nothing until VITE_ADSENSE_CLIENT (ca-pub-…) is set in Vercel, and never for Pro.
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
let loaded = false;
export default function Ad({ pro, slot = import.meta.env.VITE_ADSENSE_SLOT, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!CLIENT || pro) return;
    if (!loaded) {
      loaded = true;
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      document.head.appendChild(s);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked */ }
  }, [pro]);
  if (!CLIENT || pro) return null;
  return (
    <div className={'ad ' + className} aria-label="Advertisement">
      <small>ADVERTISEMENT</small>
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block' }} data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
