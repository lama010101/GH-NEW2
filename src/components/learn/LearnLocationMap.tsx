"use client";

// Map for the "Related location" card of the About-this-event modal: the
// current event (green) + the nearest events by distance (blue). Loaded via
// next/dynamic with ssr:false (leaflet needs window).

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import type { LearnMapPoint } from "@/core/learnTypes";
import { pointColor } from "@/core/learnMapColors";
import "leaflet/dist/leaflet.css";

const pin = (color: string, active: boolean, current: boolean) => {
  const size = active ? 26 : current ? 20 : 14;
  const ring = active
    ? "0 0 0 4px rgba(255,255,255,.55),0 0 0 7px " + color + "66,0 2px 6px rgba(0,0,0,.5)"
    : "0 2px 4px rgba(0,0,0,.4)";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:${ring}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Top-left padding clears the zoom control (~44x76px incl. margins); both
// sides add ~20px for the enlarged active-pin halo. Bottom-right clears the
// attribution bar.
const FIT_PAD_TOP_LEFT: [number, number] = [66, 98];
const FIT_PAD_BOTTOM_RIGHT: [number, number] = [30, 44];

function FitPoints({ points }: { points: LearnMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const ll = points.map((p) => L.latLng(p.lat, p.lng));
    if (ll.length === 1) {
      map.setView(ll[0], 5);
    } else {
      map.fitBounds(L.latLngBounds(ll), {
        paddingTopLeft: FIT_PAD_TOP_LEFT,
        paddingBottomRight: FIT_PAD_BOTTOM_RIGHT,
        maxZoom: 9,
      });
    }
  }, [map, points]);
  return null;
}

/** Keeps the active pin visible when it is selected from the list. */
function PanToActive({
  points,
  activeId,
}: {
  points: LearnMapPoint[];
  activeId: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    const p = points.find((x) => x.id === activeId);
    if (!p) return;
    const ll = L.latLng(p.lat, p.lng);
    map.panInside(ll, {
      paddingTopLeft: FIT_PAD_TOP_LEFT,
      paddingBottomRight: FIT_PAD_BOTTOM_RIGHT,
    });
  }, [map, points, activeId]);
  return null;
}

export function LearnLocationMap({
  points,
  yearLabel,
  activeId,
  onSelect,
}: {
  points: LearnMapPoint[];
  yearLabel: (y: number) => string;
  activeId: string | null;
  onSelect: (id: string) => void;
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
      <PanToActive points={points} activeId={activeId} />
      {points.map((p, i) => {
        const active = p.id === activeId;
        return (
        <Marker
          key={`${p.id}-${active ? "a" : "i"}`}
          position={[p.lat, p.lng]}
          icon={pin(pointColor(p.isCurrent, i - 1), active, p.isCurrent)}
          zIndexOffset={active ? 2000 : p.isCurrent ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {p.title} · {yearLabel(p.year)}
          </Tooltip>
        </Marker>
        );
      })}
    </MapContainer>
  );
}
