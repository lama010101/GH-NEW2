"use client";

import { Component, type ReactNode } from "react";
import { MapContainer, TileLayer, useMapEvents, Marker } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "@/core/types";
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
}

interface GameMapState {
  hasError: boolean;
  errorMessage?: string;
}

class GameMapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
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
            border: "1px solid var(--border)",
            color: "var(--danger)",
            padding: "20px",
            textAlign: "center"
          }}
        >
          <div>
            <strong>Map failed to render</strong>
            <p className="small" style={{ marginTop: 8 }}>
              Check console for details
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
      const { lat, lng } = event.latlng;
      console.log("[MAP_CLICK]", { lat, lng, timestamp: Date.now() });
      onSetLocation({ lat, lng });
    }
  });
  return null;
}

function createAvatarIcon(displayName: string, avatarUrl: string | null): L.DivIcon {
  const initial = displayName.charAt(0).toUpperCase();
  const circleContent = avatarUrl
    ? `<img src="${avatarUrl}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4); object-fit: cover; display: block;" />`
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
}

export class GameMap extends Component<GameMapProps, GameMapState> {
  constructor(props: GameMapProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): GameMapState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidMount() {
    console.log("[GAME_MAP_MOUNT]", {
      guessLocation: this.props.guessLocation,
      timestamp: Date.now()
    });
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
            color: "var(--danger)"
          }}
        >
          Map failed to render
        </div>
      );
    }

    return (
      <GameMapErrorBoundary>
        <div style={{ width: "100%", height: "100%", borderRadius: "20px", overflow: "hidden" }}>
          <MapContainer
            center={[20, 0]}
            zoom={2}
            style={{ width: "100%", height: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onSetLocation={this.props.onSetLocation} />
            {this.props.guessLocation && (
              <Marker
                position={[this.props.guessLocation.lat, this.props.guessLocation.lng]}
                icon={
                  this.props.localPlayerAvatarUrl !== undefined || this.props.localPlayerDisplayName !== undefined
                    ? createAvatarIcon(
                        this.props.localPlayerDisplayName ?? "You",
                        this.props.localPlayerAvatarUrl ?? null
                      )
                    : undefined
                }
              />
            )}
            {this.props.playerMarkers &&
              this.props.playerMarkers.map((marker) => (
                <Marker
                  key={marker.playerId}
                  position={[marker.location.lat, marker.location.lng]}
                  icon={createAvatarIcon(marker.displayName, marker.avatarUrl)}
                />
              ))}
          </MapContainer>
        </div>
      </GameMapErrorBoundary>
    );
  }
}
