"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type EventsMapMarker = {
  slug: string;
  title: string;
  year: number;
  lat: number;
  lng: number;
};

const markerIcon = new L.DivIcon({
  className: "events-map-marker",
  html: `<div style="
    background-color: #f0c060;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
    cursor: pointer;
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/** Fits the viewport to the plotted markers once on mount. */
function FitBounds({ markers }: { markers: EventsMapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 6);
      return;
    }
    map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])).pad(0.15));
  }, [map, markers]);
  return null;
}

export default function EventsMapLeaflet({
  markers,
  height = 320,
  linkMarkers = true,
}: {
  markers: EventsMapMarker[];
  height?: number;
  linkMarkers?: boolean;
}) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ width: "100%", height: `${height}px` }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY ?? ""}`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitBounds markers={markers} />
      {markers.map((m) => (
        <Marker
          key={m.slug}
          position={[m.lat, m.lng]}
          icon={markerIcon}
          eventHandlers={
            linkMarkers
              ? { click: () => { window.location.href = `/events/${m.slug}`; } }
              : undefined
          }
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {m.title} ({m.year})
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
