"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui";
import { updateClubLocation, type OnboardingActionState } from "./actions";

const LocationMap = dynamic(
  () => import("./LocationMap").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[220px] lg:h-[320px] rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
    ),
  }
);

export type Step2LocationClub = {
  id: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

interface Step2Props {
  club: Step2LocationClub;
  onNext: () => void;
  formId: string;
}

export function Step2Location({ club, onNext, formId }: Step2Props) {
  const router = useRouter();
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const boundAction = updateClubLocation.bind(null, club.id);
  const [formState, formAction] = useActionState<OnboardingActionState, FormData>(
    boundAction,
    {}
  );

  const [address, setAddress] = useState(club.address ?? "");
  const [city, setCity] = useState(club.city ?? "");
  const [region, setRegion] = useState(club.state ?? "");
  const [country, setCountry] = useState(club.country ?? "Colombia");
  const [lat, setLat] = useState(club.latitude?.toString() ?? "");
  const [lng, setLng] = useState(club.longitude?.toString() ?? "");
  const [mapKey, setMapKey] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (formState.success) {
      router.refresh();
      onNextRef.current();
    }
  }, [formState.success, router]);

  async function handleGeocode() {
    const q = [address, city, region, country].filter(Boolean).join(", ");
    if (!q) return;

    setIsLocating(true);
    setGeoError(null);

    try {
      const qs = new URLSearchParams({ q, format: "json", limit: "1", addressdetails: "1" });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
        headers: { "Accept-Language": "es", "User-Agent": "PadelClub/1.0 (padelclub.app)" },
      });
      if (!res.ok) throw new Error();
      const data: Array<{ lat: string; lon: string }> = await res.json();
      if (!data.length) {
        setGeoError("No se encontró la ubicación. Prueba con una dirección más específica.");
        return;
      }
      setLat(data[0].lat);
      setLng(data[0].lon);
      setMapKey((k) => k + 1);
    } catch {
      setGeoError("No se pudo conectar con el servicio de geocodificación.");
    } finally {
      setIsLocating(false);
    }
  }

  const hasCoords = lat !== "" && lng !== "";

  return (
    <form id={formId} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        {/* Left column: manual fields */}
        <div className="flex flex-col gap-4">
          <Input
            name="country"
            label="País"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Colombia"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="state"
              label="Departamento / Estado"
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Boyacá"
            />
            <Input
              name="city"
              label="Ciudad"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Tunja"
            />
          </div>
          <Input
            name="address"
            label="Dirección"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Cra 1 # 2-3"
          />

          {/* Geocode trigger */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleGeocode}
              disabled={!city.trim() || isLocating}
              className="flex items-center gap-2 self-start px-4 py-2.5 rounded-xl text-sm font-medium border border-white/15 text-white/80 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLocating ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
              {isLocating ? "Ubicando…" : "Ubicar en el mapa"}
            </button>

            {geoError && (
              <p className="text-sm text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                {geoError}
              </p>
            )}
          </div>
        </div>

        {/* Right column: map */}
        {hasCoords ? (
          <div className="flex flex-col gap-2">
            <LocationMap
              key={mapKey}
              lat={parseFloat(lat)}
              lng={parseFloat(lng)}
              onCoordinatesChange={(newLat, newLng) => {
                setLat(newLat.toString());
                setLng(newLng.toString());
              }}
            />
            <div className="flex items-center gap-2 text-xs text-white/50 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
              <MapPin
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--club-primary, #B7E000)" }}
              />
              <span>
                {parseFloat(lat).toFixed(5)}°, {parseFloat(lng).toFixed(5)}°
              </span>
              <span className="text-white/25 ml-1">· Arrastra el marcador para ajustar</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-[160px] lg:h-[320px] rounded-xl border border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-center px-6">
            <MapPin className="w-6 h-6 text-white/15" />
            <p className="text-sm text-white/35">
              Completa la dirección para ubicar el club en el mapa.
            </p>
          </div>
        )}
      </div>

      {/* Hidden coordinate inputs */}
      <input type="hidden" name="latitude" value={lat} />
      <input type="hidden" name="longitude" value={lng} />

      {formState.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {formState.error}
        </p>
      )}
    </form>
  );
}
