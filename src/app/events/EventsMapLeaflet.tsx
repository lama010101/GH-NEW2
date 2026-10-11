"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

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

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 100 ? 40 : 46;
  return new L.DivIcon({
    className: "events-map-cluster",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(240, 192, 96, 0.92);
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      color: #1a1205;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

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
  scrollWheelZoom = false,
}: {
  markers: EventsMapMarker[];
  height?: number | string;
  linkMarkers?: boolean;
  scrollWheelZoom?: boolean;
}) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ width: "100%", height: typeof height === "number" ? `${height}px` : height }}
      scrollWheelZoom={scrollWheelZoom}
    >
      <TileLayer
        url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY ?? ""}`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitBounds markers={markers} />
      <MarkerClusterGroup
        iconCreateFunction={clusterIcon}
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        maxClusterRadius={50}
      >
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
      </MarkerClusterGroup>
    </MapContainer>
  );
}
