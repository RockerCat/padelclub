"use client";

import { useCallback, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const LOCATED_ZOOM = 14;

const MARKER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">` +
  `<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="#ef4444"/>` +
  `<circle cx="12" cy="12" r="5" fill="white"/>` +
  `</svg>`;

function makeIcon() {
  return L.divIcon({ html: MARKER_SVG, className: "", iconSize: [24, 36], iconAnchor: [12, 36] });
}

interface Props {
  lat: number;
  lng: number;
  onCoordinatesChange: (lat: number, lng: number) => void;
}

export function LocationMap({ lat, lng, onCoordinatesChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onCoordinatesChange);
  onChangeRef.current = onCoordinatesChange;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const placeMarker = useCallback((latLng: L.LatLng) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng(latLng);
    } else {
      const m = L.marker(latLng, { icon: makeIcon(), draggable: true }).addTo(mapRef.current);
      m.on("dragend", () => {
        const pos = m.getLatLng();
        onChangeRef.current(pos.lat, pos.lng);
      });
      markerRef.current = m;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: LOCATED_ZOOM,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    placeMarker(L.latLng(lat, lng));

    map.on("click", (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng);
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-[220px] lg:h-[320px] rounded-xl overflow-hidden border border-white/10"
    />
  );
}
