"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, AttributionControl, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import { toProxiedImageUrl } from "@/lib/imageProxy";
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
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const correctIcon = createIcon("#22C55E"); // Green

const createAvatarIcon = (avatarUrl: string | null | undefined, label: string | undefined): L.DivIcon => {
  const initial = label ? label.charAt(0).toUpperCase() : "?";
  const circleContent = avatarUrl
    ? `<img src="${toProxiedImageUrl(avatarUrl) ?? ''}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4); object-fit: cover; display: block;" />`
    : `<div style="width: 36px; height: 36px; border-radius: 50%; background: #4b5563; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4);">${initial}</div>`;

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

function normalizeLongitude(lng: number, refLng: number): number {
  // Keep the short way across the antimeridian by expressing the longitude
  // relative to the reference longitude.
  const ref = ((refLng % 360) + 540) % 360 - 180;
  const delta = ((lng - ref + 540) % 360) - 180;
  return ref + delta;
}

function displayLatLng(lat: number, lng: number, refLng: number): L.LatLng {
  return L.latLng(lat, normalizeLongitude(lng, refLng));
}

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
    const correctLL = L.latLng(correctLat, correctLng).wrap();
    const points: L.LatLng[] = [correctLL];
    if (guessLat !== null && guessLng !== null) {
      points.push(displayLatLng(guessLat, guessLng, correctLL.lng));
    }
    if (playerGuesses && playerGuesses.length > 0) {
      for (const g of playerGuesses) {
        points.push(displayLatLng(g.lat, g.lng, correctLL.lng));
      }
    }
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView(correctLL, 5);
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
  const correctLL = L.latLng(correctLat, correctLng).wrap();
  const guessLL = hasGuess ? displayLatLng(guessLat, guessLng, correctLL.lng) : null;

  return (
    <MapContainer
      center={correctLL}
      zoom={5}
      style={{ width: "100%", height: "100%", borderRadius: "4px" }}
      dragging={false}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      touchZoom={false}
      keyboard={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <AttributionControl prefix={false} position="bottomright" />

      <MapController
        correctLat={correctLat}
        correctLng={correctLng}
        guessLat={guessLat}
        guessLng={guessLng}
        playerGuesses={playerGuesses}
      />

      {/* Correct location marker (always shown) */}
      <Marker position={correctLL} icon={correctIcon} />

      {/* Guess marker (only if player submitted a location) */}
      {guessLL && (
        <Marker
          position={guessLL}
          icon={createAvatarIcon(ownAvatarUrl ?? null, ownLabel ?? "")}
        />
      )}

      {/* Dashed connecting line (only if both markers exist) */}
      {guessLL && (
        <Polyline
          positions={[correctLL, guessLL]}
          dashArray="8, 6"
          color="#FFFFFF"
          opacity={0.7}
          weight={2}
        />
      )}

      {/* All player guess markers */}
      {playerGuesses?.map((g) => {
        const gLL = displayLatLng(g.lat, g.lng, correctLL.lng);
        return (
          <Marker
            key={g.playerId}
            position={gLL}
            icon={createAvatarIcon(g.avatarUrl, g.label)}
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
        const gLL = displayLatLng(g.lat, g.lng, correctLL.lng);
        return (
          <Polyline
            key={`line-${g.playerId}`}
            positions={[correctLL, gLL]}
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
