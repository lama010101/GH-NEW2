"use client";

import { Component, type ReactNode, useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMapEvents, Marker, useMap } from "react-leaflet";
import { useTranslations } from "next-intl";
import L from "leaflet";
import type { LatLng } from "@/core/types";
import { toProxiedImageUrl } from "@/lib/imageProxy";
import "leaflet/dist/leaflet.css";

interface GameMapProps {
  guessLocation: LatLng | null;
  onSetLocation: (location: LatLng) => void;
  playerMarkers?: Array<{
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
    location: { lat: number; lng: number };
  }>;
  localPlayerAvatarUrl?: string | null;
  localPlayerDisplayName?: string;
  hideZoomControls?: boolean;
  flyToTarget?: { lat: number; lng: number; id: number } | null;
  errorTitle?: string;
  errorDetails?: string;
}

interface GameMapState {
  hasError: boolean;
  errorMessage?: string;
}

class GameMapErrorBoundary extends Component<{ children: ReactNode; errorTitle?: string; errorDetails?: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; errorTitle?: string; errorDetails?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[GAME_MAP_ERROR]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(239, 68, 68, 0.08)",
            borderRadius: "20px",
            border: "1px solid var(--gh-border-default)",
            color: "var(--gh-danger)",
            padding: "20px",
            textAlign: "center"
          }}
        >
          <div>
            <strong>{this.props.errorTitle ?? "Map failed to render"}</strong>
            <p className="small" style={{ marginTop: 8 }}>
              {this.props.errorDetails ?? "Check console for details"}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function MapClickHandler({ onSetLocation }: { onSetLocation: (location: LatLng) => void }) {
  useMapEvents({
    click: (event: { latlng: { lat: number; lng: number } }) => {
      const { lat, lng } = L.latLng(event.latlng.lat, event.latlng.lng).wrap();
      console.log("[MAP_CLICK]", { lat, lng, timestamp: Date.now() });
      onSetLocation({ lat, lng });
    }
  });
  return null;
}

function FlyToHandler({ target }: { target: { lat: number; lng: number; id: number } | null | undefined }) {
  const map = useMap();
  const lastId = useRef(-1);
  useEffect(() => {
    if (target && target.id !== lastId.current) {
      lastId.current = target.id;
      const { lat, lng } = L.latLng(target.lat, target.lng).wrap();
      map.flyTo([lat, lng], 6, { animate: true, duration: 0.8 });
    }
  }, [target, map]);
  return null;
}

class GameMapInner extends Component<GameMapProps, GameMapState> {
  constructor(props: GameMapProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): GameMapState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidUpdate(prevProps: GameMapProps) {
    if (prevProps.guessLocation !== this.props.guessLocation) {
      console.log("[GAME_MAP_UPDATE]", {
        guessLocation: this.props.guessLocation,
        timestamp: Date.now()
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(239, 68, 68, 0.08)",
            borderRadius: "20px",
            color: "var(--gh-danger)"
          }}
        >
          {this.props.errorTitle ?? "Map failed to render"}
        </div>
      );
    }

    return (
      <GameMapErrorBoundary errorTitle={this.props.errorTitle} errorDetails={this.props.errorDetails}>
        <div style={{ width: "100%", height: "100%", borderRadius: 0, overflow: "hidden" }}>
          <MapContainer
            center={[20, 0]}
            zoom={1}
            style={{ width: "100%", height: "100%" }}
            zoomControl={!this.props.hideZoomControls}
            scrollWheelZoom={true}
            worldCopyJump={true}
          >
            <TileLayer
              url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY ?? ""}`}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            <MapClickHandler onSetLocation={this.props.onSetLocation} />
            <FlyToHandler target={this.props.flyToTarget} />
            {this.props.guessLocation && (
              <Marker
                position={[L.latLng(this.props.guessLocation.lat, this.props.guessLocation.lng).wrap().lat, L.latLng(this.props.guessLocation.lat, this.props.guessLocation.lng).wrap().lng]}
                icon={L.divIcon({
                  className: "",
                  html: this.props.localPlayerAvatarUrl
                    ? `<img src="${toProxiedImageUrl(this.props.localPlayerAvatarUrl) ?? ''}" style="width:32px;height:32px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);object-fit:cover;" />`
                    : '<div style="width:12px;height:12px;background:#888;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>',
                  iconSize: this.props.localPlayerAvatarUrl ? [32, 32] : [12, 12],
                  iconAnchor: this.props.localPlayerAvatarUrl ? [16, 16] : [6, 6],
                })}
              />
            )}
            {this.props.playerMarkers &&
              this.props.playerMarkers.map((marker) => (
                <Marker
                  key={marker.playerId}
                  position={[L.latLng(marker.location.lat, marker.location.lng).wrap().lat, L.latLng(marker.location.lat, marker.location.lng).wrap().lng]}
                  icon={L.divIcon({
                    className: "",
                    html: marker.avatarUrl
                      ? `<img src="${toProxiedImageUrl(marker.avatarUrl) ?? ''}" style="width:32px;height:32px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);object-fit:cover;" />`
                      : '<div style="width:12px;height:12px;background:#888;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>',
                    iconSize: marker.avatarUrl ? [32, 32] : [12, 12],
                    iconAnchor: marker.avatarUrl ? [16, 16] : [6, 6],
                  })}
                />
              ))}
          </MapContainer>
        </div>
      </GameMapErrorBoundary>
    );
  }
}

export function GameMap(props: GameMapProps) {
  const t = useTranslations("game");
  return (
    <GameMapInner
      {...props}
      errorTitle={t("map_error_title")}
      errorDetails={t("map_error_details")}
    />
  );
}
