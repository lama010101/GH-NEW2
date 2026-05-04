"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PlayerGuess {
  playerId: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

interface StaticResultMapProps {
  correctLat: number;
  correctLng: number;
  guessLat: number | null;
  guessLng: number | null;
  playerGuesses?: PlayerGuess[];
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

const PLAYER_COLORS = ["#EF4444", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B"];

function MapController({
  correctLat,
  correctLng,
  guessLat,
  guessLng,
  playerGuesses,
}: {
  correctLat: number;
  correctLng: number;
  guessLat: number | null;
  guessLng: number | null;
  playerGuesses?: PlayerGuess[];
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [[correctLat, correctLng]];
    if (guessLat !== null && guessLng !== null) {
      points.push([guessLat, guessLng]);
    }
    if (playerGuesses && playerGuesses.length > 0) {
      for (const g of playerGuesses) {
        points.push([g.lat, g.lng]);
      }
    }
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([correctLat, correctLng], 5);
    }
  }, [map, correctLat, correctLng, guessLat, guessLng, playerGuesses]);

  return null;
}

export function StaticResultMap({
  correctLat,
  correctLng,
  guessLat,
  guessLng,
  playerGuesses,
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
        playerGuesses={playerGuesses}
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

      {/* All player guess markers */}
      {playerGuesses?.map((g, i) => {
        const color = g.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length];
        return (
          <Marker
            key={g.playerId}
            position={[g.lat, g.lng]}
            icon={createIcon(color)}
          >
            {g.label ? (
              <Tooltip direction="top" offset={[0, -10]}>
                {g.label}
              </Tooltip>
            ) : null}
          </Marker>
        );
      })}

      {/* Polylines from each player guess to correct location */}
      {playerGuesses?.map((g, i) => {
        const color = g.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length];
        return (
          <Polyline
            key={`line-${g.playerId}`}
            positions={[
              [correctLat, correctLng],
              [g.lat, g.lng],
            ]}
            dashArray="8, 6"
            color={color}
            opacity={0.5}
            weight={1}
          />
        );
      })}
    </MapContainer>
  );
}
