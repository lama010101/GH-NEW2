// EDQ-FIX-HARVESTER-OPS-1126-904
// Continent derivation from the reverse-geocoded ISO 3166 alpha-2 country
// code. Coordinates are consulted only for the transcontinental cases that
// the production locations table already treats as coordinate-dependent.

type Continent =
  | "Africa"
  | "Antarctica"
  | "Asia"
  | "Europe"
  | "North America"
  | "Oceania"
  | "South America";

const EUROPE = new Set([
  "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK",
  "EE", "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE",
  "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK",
  "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "UA",
  "VA", "XK",
]);

const ASIA = new Set([
  "AE", "AF", "AM", "BD", "BH", "BN", "BT", "CN", "HK", "ID", "IL", "IN",
  "IO", "IQ", "IR", "JO", "JP", "KG", "KH", "KP", "KR", "KW", "LA", "LB",
  "LK", "MM", "MN", "MO", "MV", "MY", "NP", "OM", "PH", "PK", "PS", "QA",
  "SA", "SG", "SY", "TH", "TJ", "TL", "TM", "TW", "UZ", "VN", "YE",
]);

const AFRICA = new Set([
  "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ",
  "DZ", "EH", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM",
  "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA", "NE",
  "NG", "RE", "RW", "SC", "SD", "SH", "SL", "SN", "SO", "SS", "ST", "SZ",
  "TD", "TG", "TN", "TZ", "UG", "YT", "ZA", "ZM", "ZW",
]);

const NORTH_AMERICA = new Set([
  "AG", "AI", "AW", "BB", "BL", "BM", "BQ", "BS", "BZ", "CA", "CR", "CU",
  "CW", "DM", "DO", "GD", "GL", "GP", "GT", "HN", "HT", "JM", "KN", "KY",
  "LC", "MF", "MQ", "MS", "MX", "NI", "PA", "PM", "PR", "SV", "SX", "TC",
  "TT", "US", "VG", "VI",
]);

const SOUTH_AMERICA = new Set([
  "AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PE", "PY", "SR",
  "UY", "VE",
]);

const OCEANIA = new Set([
  "AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR",
  "NU", "NZ", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "UM", "VU",
  "WF", "WS",
]);

function transcontinentalContinent(
  iso2: string,
  lat: number,
  lon: number
): Continent | null {
  switch (iso2) {
    case "RU":
      // Ural boundary: Europe west of roughly 60E. East longitudes wrapping
      // negative (Chukotka/Bering) are Asia, not Europe.
      return lon >= 0 && lon < 60 ? "Europe" : "Asia";
    case "TR":
      // Only East Thrace/Istanbul is Europe; Anatolia (including Ankara) is Asia.
      return lat >= 40.4 && lon <= 30.5 ? "Europe" : "Asia";
    case "KZ":
      // Ural River boundary: the far west of Kazakhstan is Europe.
      return lat >= 46 && lon < 51.5 ? "Europe" : "Asia";
    case "EG": {
      // Sinai/east-of-Suez is Asia; the African mainland and Red Sea coast stay Africa.
      const inSinai = lat >= 27.7 && lat <= 31.4 && lon > 32.45 && lon < 35.1;
      return inSinai ? "Asia" : "Africa";
    }
    case "GE":
      // Prod convention: Tbilisi/eastern Georgia is Europe; far-western Lazica is Asia.
      return lon >= 43.5 ? "Europe" : "Asia";
    case "AM":
      return "Asia";
    case "AZ":
      return "Europe";
    case "CY":
      return "Europe";
    default:
      return null;
  }
}

/**
 * Resolve the production continent convention for an ISO 3166 alpha-2 code.
 * Unknown or absent codes are unknown — never classified by coordinate boxes.
 * ISO codes are case-insensitive; the pseudo-code XK (Kosovo, used by
 * Nominatim) is Europe. Coordinates are consulted only for the explicitly
 * transcontinental countries in transcontinentalContinent. regionCode is the
 * reverse-geocoded ISO 3166-2 subdivision when available; US-HI is Oceania by
 * the product convention even though its country code is US.
 */
export function continentForCountryCode(
  iso2: string | null | undefined,
  lat: number,
  lon: number,
  regionCode?: string | null
): string {
  const code = iso2?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return "unknown";

  if (code === "US" && regionCode?.trim().toUpperCase() === "US-HI") return "Oceania";
  const special = transcontinentalContinent(code, lat, lon);
  if (special) return special;
  if (EUROPE.has(code)) return "Europe";
  if (ASIA.has(code)) return "Asia";
  if (AFRICA.has(code)) return "Africa";
  if (NORTH_AMERICA.has(code)) return "North America";
  if (SOUTH_AMERICA.has(code)) return "South America";
  if (OCEANIA.has(code)) return "Oceania";
  if (code === "AQ") return "Antarctica";
  return "unknown";
}
