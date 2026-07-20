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
  avatarUrl?: string | null;
}

interface StaticResultMapProps {
  correctLat: number;
  correctLng: number;
  guessLat: number | null;
  guessLng: number | null;
  playerGuesses?: PlayerGuess[];
  ownAvatarUrl?: string | null;
  ownLabel?: string;
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
      border: 2px solid var(--gh-text-primary);
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const correctIcon = createIcon("var(--gh-success)"); // Green

const createAvatarIcon = (avatarUrl: string | null | undefined, label: string | undefined): L.DivIcon => {
  const initial = label ? label.charAt(0).toUpperCase() : "?";
  const circleContent = avatarUrl
    ? `<img src="${avatarUrl}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--gh-text-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.4); object-fit: cover; display: block;" />`
    : `<div style="width: 36px; height: 36px; border-radius: 50%; background: var(--gh-avatar-fallback-bg); display: flex; align-items: center; justify-content: center; color: var(--gh-text-primary); font-weight: 600; font-size: 14px; border: 2px solid var(--gh-text-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.4);">${initial}</div>`;

  const html = `
    <div style="position: relative; width: 36px; height: 36px; overflow: visible;">
      ${circleContent}
    </div>
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

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
  ownAvatarUrl,
  ownLabel,
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
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      
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
        <Marker
          position={[guessLat, guessLng]}
          icon={createAvatarIcon(ownAvatarUrl ?? null, ownLabel ?? "")}
        />
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
      {playerGuesses?.map((g) => (
        <Marker
          key={g.playerId}
          position={[g.lat, g.lng]}
          icon={createAvatarIcon(g.avatarUrl, g.label)}
        >
          {g.label ? (
            <Tooltip direction="top" offset={[0, -10]}>
              {g.label}
            </Tooltip>
          ) : null}
        </Marker>
      ))}

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
