"use client";

// Map for the "Related location" card of the About-this-event modal: the
// current event (green) + the nearest events by distance (blue). Loaded via
// next/dynamic with ssr:false (leaflet needs window).

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import type { LearnMapPoint } from "@/core/learnTypes";
import "leaflet/dist/leaflet.css";

const pin = (color: string, size: number) =>
  L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const CURRENT_ICON = pin("#22C55E", 20);
const NEAR_ICON = pin("#3B82F6", 14);

function FitPoints({ points }: { points: LearnMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const ll = points.map((p) => L.latLng(p.lat, p.lng));
    if (ll.length === 1) {
      map.setView(ll[0], 5);
    } else {
      map.fitBounds(L.latLngBounds(ll), { padding: [28, 28], maxZoom: 9 });
    }
  }, [map, points]);
  return null;
}

export function LearnLocationMap({
  points,
  yearLabel,
}: {
  points: LearnMapPoint[];
  yearLabel: (y: number) => string;
}) {
  const start = points[0];
  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={5}
      scrollWheelZoom={false}
      // A draggable map inside the scrolling modal traps touch scrolling.
      dragging={!L.Browser.mobile}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY ?? ""}`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitPoints points={points} />
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={p.isCurrent ? CURRENT_ICON : NEAR_ICON}
          zIndexOffset={p.isCurrent ? 1000 : 0}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {p.title} · {yearLabel(p.year)}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
