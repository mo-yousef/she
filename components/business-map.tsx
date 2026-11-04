'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/**
 * Small interactive OpenStreetMap for the business sidebar. Leaflet touches
 * `window`, so it is imported inside the effect and this component is only
 * ever rendered through the ssr:false wrapper (business-map-lazy.tsx).
 *
 * The marker is a circleMarker (SVG, brand colour) so we avoid Leaflet's
 * default PNG icon, which breaks under bundlers. Attribution is Leaflet's
 * built-in control and stays visible, as the OSM tile policy requires.
 * Dark mode: tiles are inverted with CSS (see `.map-tiles` in globals.css).
 * No marker animation, so nothing to gate behind reduced motion.
 */
export default function BusinessMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import('leaflet').then((L) => {
      if (cancelled) return;
      const map = L.map(el, {
        center: [lat, lng],
        zoom: 15,
        scrollWheelZoom: false, // page scroll must not get trapped by the map
        zoomAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.circleMarker([lat, lng], {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: getComputedStyle(el).getPropertyValue('--b1').trim() || '#4a2c6d',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      cleanup = () => map.remove();
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [lat, lng]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className="map-tiles aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-input)]"
    />
  );
}
