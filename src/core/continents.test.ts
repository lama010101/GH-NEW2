import { describe, expect, it } from "vitest";
import { continentForCountryCode } from "./continents";

describe("continentForCountryCode (EDQ-FIX-HARVESTER-OPS-1126-904)", () => {
  it("classifies the Middle East as Asia", () => {
    expect(continentForCountryCode("IQ", 32.616, 44.025)).toBe("Asia"); // Karbala
    expect(continentForCountryCode("KW", 29.3759, 47.9774)).toBe("Asia"); // Kuwait City
    expect(continentForCountryCode("SA", 24.7136, 46.6753)).toBe("Asia"); // Riyadh
    expect(continentForCountryCode("SY", 33.5138, 36.2765)).toBe("Asia"); // Damascus
    expect(continentForCountryCode("IL", 31.7683, 35.2137)).toBe("Asia"); // Jerusalem
    expect(continentForCountryCode("PS", 31.7683, 35.2137)).toBe("Asia"); // Jerusalem
  });

  it("splits Egypt only for Sinai/east of Suez", () => {
    expect(continentForCountryCode("EG", 30.0444, 31.2357)).toBe("Africa"); // Cairo
    expect(continentForCountryCode("EG", 29.4923, 34.8948)).toBe("Asia"); // Taba, Sinai
  });

  it("splits Turkey and Russia by coordinates", () => {
    expect(continentForCountryCode("TR", 41.0082, 28.9784)).toBe("Europe"); // Istanbul
    expect(continentForCountryCode("TR", 39.9334, 32.8597)).toBe("Asia"); // Ankara
    expect(continentForCountryCode("RU", 55.7558, 37.6173)).toBe("Europe"); // Moscow
    expect(continentForCountryCode("RU", 55.0084, 82.9357)).toBe("Asia"); // Novosibirsk
  });

  it("uses fixed country assignment for non-listed transcontinental states", () => {
    expect(continentForCountryCode("US", 21.3099, -157.8581)).toBe("North America"); // Honolulu
    expect(continentForCountryCode("VA", 41.9029, 12.4534)).toBe("Europe"); // Vatican City
    expect(continentForCountryCode("IT", 38.1157, 13.3615)).toBe("Europe"); // Palermo
    expect(continentForCountryCode("MT", 35.8989, 14.5146)).toBe("Europe"); // Valletta
    expect(continentForCountryCode("IS", 64.1466, -21.9426)).toBe("Europe"); // Reykjavik
    expect(continentForCountryCode("AQ", -77.8419, 166.6863)).toBe("Antarctica"); // McMurdo
  });

  it("uses coordinate fallback only when no country code exists", () => {
    expect(continentForCountryCode(null, 32.616, 44.025)).toBe("Asia"); // Middle East carve-out
    expect(continentForCountryCode(undefined, 41.9029, 12.4534)).toBe("Europe");
    expect(continentForCountryCode(null, 0, -150)).toBe("unknown");
  });
});
