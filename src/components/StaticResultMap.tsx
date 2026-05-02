"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

interface StaticResultMapProps {
  correctLat: number;
  correctLng: number;
  guessLat: number | null;
  guessLng: number | null;
}

// Custom marker icons
const createIcon = (color: string) => {
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const correctIcon = createIcon("#22C55E"); // Green
const guessIcon = createIcon("#FF6B2B"); // Orange

function MapController({
  correctLat,
  correctLng,
  guessLat,
  guessLng,
}: {
  correctLat: number;
  correctLng: number;
  guessLat: number | null;
  guessLng: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (guessLat !== null && guessLng !== null) {
      // Both markers present: fit bounds with padding
      const bounds = L.latLngBounds([
        [correctLat, correctLng],
        [guessLat, guessLng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      // Only correct marker: center on it with zoom 5
      map.setView([correctLat, correctLng], 5);
    }
  }, [map, correctLat, correctLng, guessLat, guessLng]);

  return null;
}

export function StaticResultMap({
  correctLat,
  correctLng,
  guessLat,
  guessLng,
}: StaticResultMapProps) {
  const hasGuess = guessLat !== null && guessLng !== null;

  return (
    <MapContainer
      center={[correctLat, correctLng]}
      zoom={5}
      style={{ width: "100%", height: "220px", borderRadius: "4px" }}
      dragging={false}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      touchZoom={false}
      keyboard={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      
      <MapController
        correctLat={correctLat}
        correctLng={correctLng}
        guessLat={guessLat}
        guessLng={guessLng}
      />

      {/* Correct location marker (always shown) */}
      <Marker position={[correctLat, correctLng]} icon={correctIcon} />

      {/* Guess marker (only if player submitted a location) */}
      {hasGuess && (
        <Marker position={[guessLat, guessLng]} icon={guessIcon} />
      )}

      {/* Dashed connecting line (only if both markers exist) */}
      {hasGuess && (
        <Polyline
          positions={[
            [correctLat, correctLng],
            [guessLat, guessLng],
          ]}
          dashArray="8, 6"
          color="#FFFFFF"
          opacity={0.7}
          weight={2}
        />
      )}
    </MapContainer>
  );
}
