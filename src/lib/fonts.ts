// Self-hosted fonts (latin subset, from Google Fonts, OFL licensed).
//
// Replaces next/font/google. That loader downloads the fonts from Google at build time and crashes
// the whole build ("Cannot read properties of null (reading '1')") whenever Google's CSS comes back
// with a font URL it can't parse. Local files make the build independent of Google.
import localFont from "next/font/local";

// DM Sans is a variable font: the single file covers every weight used in the app (300-800).
export const dmSans = localFont({
  src: "../fonts/DMSans-latin.woff2",
  weight: "100 1000",
  style: "normal",
  variable: "--font-dm-sans",
  display: "swap",
});

export const bebasNeue = localFont({
  src: "../fonts/BebasNeue-latin.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-bebas",
  display: "swap",
});

export const sora = localFont({
  src: "../fonts/Sora-latin.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-sora",
  display: "swap",
});
