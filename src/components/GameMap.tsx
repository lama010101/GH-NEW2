"use client";

import { Component, type ReactNode } from "react";
import { MapContainer, TileLayer, useMapEvents, Marker } from "react-leaflet";
import type { LatLng } from "@/core/types";
import "leaflet/dist/leaflet.css";

interface GameMapProps {
  guessLocation: LatLng | null;
  onSetLocation: (location: LatLng) => void;
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

function MapMarker({ location }: { location: LatLng }) {
  return <Marker position={[location.lat, location.lng]} />;
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
            {this.props.guessLocation && <MapMarker location={this.props.guessLocation} />}
          </MapContainer>
        </div>
      </GameMapErrorBoundary>
    );
  }
}
