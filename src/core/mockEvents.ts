import { EventRecord } from "./types";

export const PRACTICE_EVENTS: EventRecord[] = [
  {
    id: "event-1",
    title: "The first moon landing",
    description: "A historic leap for humanity.",
    year: 1969,
    location: { lat: 28.5729, lng: -80.649 },
    region: "North America",
    imageLabel: "Apollo 11 launch photo"
  },
  {
    id: "event-2",
    title: "Fall of the Berlin Wall",
    description: "A defining moment in modern history.",
    year: 1989,
    location: { lat: 52.5163, lng: 13.3777 },
    region: "Europe",
    imageLabel: "Crowd at the wall"
  },
  {
    id: "event-3",
    title: "Signing of the U.S. Declaration of Independence",
    description: "A foundational political event.",
    year: 1776,
    location: { lat: 39.9496, lng: -75.1503 },
    region: "North America",
    imageLabel: "Historic document scene"
  },
  {
    id: "event-4",
    title: "First powered flight",
    description: "The Wright brothers change transportation forever.",
    year: 1903,
    location: { lat: 36.0159, lng: -75.671 },
    region: "North America",
    imageLabel: "Wright Flyer in motion"
  },
  {
    id: "event-5",
    title: "Opening of the Suez Canal",
    description: "A major global trade milestone.",
    year: 1869,
    location: { lat: 30.0444, lng: 32.531 },
    region: "Africa",
    imageLabel: "Canal opening ceremony"
  }
];
