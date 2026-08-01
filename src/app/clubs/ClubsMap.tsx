"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

// Colombia-wide fallback — only used when the current filtered list has no
// club with valid coordinates at all. Whenever one exists, the map centers
// on the first visible club instead (see `focusClub`), never on this.
const DEFAULT_CENTER: [number, number] = [4.5709, -74.2973];
const DEFAULT_ZOOM = 5;
// "Ciudad/barrio" zoom used to center on the current focus club — close
// enough to read a neighborhood, far enough to not look like a street view.
const CITY_ZOOM = 13;

function pinSvg(active: boolean) {
  const w = active ? 30 : 22;
  const h = active ? 44 : 32;
  const color = active ? CLUB_PRIMARY_COLOR : `${CLUB_PRIMARY_COLOR}99`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${w}" height="${h}">` +
    `<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5" fill="#04141a"/>` +
    `</svg>`
  );
}

function makeIcon(active: boolean) {
  const w = active ? 30 : 22;
  const h = active ? 44 : 32;
  return L.divIcon({ html: pinSvg(active), className: "", iconSize: [w, h], iconAnchor: [w / 2, h] });
}

export interface ClubsMapClub {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
}

export interface ClubsMapFocus {
  id: string;
  latitude: number;
  longitude: number;
}

interface ClubsMapProps {
  clubs: ClubsMapClub[];
  activeClubId: string | null;
  onMarkerClick: (id: string) => void;
  /** First club (with valid coordinates) in the currently filtered list —
   *  the map centers on this, never on a bounds fit across every marker. */
  focusClub: ClubsMapFocus | null;
}

export function ClubsMap({ clubs, activeClubId, onMarkerClick, focusClub }: ClubsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const lastFocusIdRef = useRef<string | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Read focusClub's value at mount time only — the dedicated recenter
    // effect below handles every later change, so it's deliberately absent
    // from the dependency array (same pattern as LocationMap's lat/lng).
    const map = L.map(containerRef.current, {
      center: focusClub ? [focusClub.latitude, focusClub.longitude] : DEFAULT_CENTER,
      zoom: focusClub ? CITY_ZOOM : DEFAULT_ZOOM,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    lastFocusIdRef.current = focusClub?.id ?? null;
    const markers = markersRef.current;

    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers in sync with the filtered club list — never moves the view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;
    const nextIds = new Set(clubs.map((c) => c.id));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const club of clubs) {
      if (markers.has(club.id)) continue;
      const marker = L.marker([club.latitude, club.longitude], { icon: makeIcon(false) });
      marker.bindTooltip(club.name, { direction: "top", offset: [0, -28] });
      marker.on("click", () => onMarkerClickRef.current(club.id));
      marker.addTo(map);
      markers.set(club.id, marker);
    }
  }, [clubs]);

  // Recenter only when the identity of the focus club actually changes —
  // e.g. filters narrow the list and a different club becomes first. A safe
  // fallback (Colombia-wide) kicks in once no club has coordinates at all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const focusId = focusClub?.id ?? null;
    if (focusId === lastFocusIdRef.current) return;
    lastFocusIdRef.current = focusId;

    if (focusClub) {
      map.setView([focusClub.latitude, focusClub.longitude], CITY_ZOOM);
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [focusClub]);

  // Reflect hover/selection on marker icons without recreating them.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.setIcon(makeIcon(id === activeClubId));
      marker.setZIndexOffset(id === activeClubId ? 1000 : 0);
    }
  }, [activeClubId]);

  return <div ref={containerRef} className="w-full h-full" />;
}
