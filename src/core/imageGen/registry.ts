// EDQ-BUILD-ADMINGEN-1122-815 — image-generation model registry.
//
// Provider is Runware ONLY (CTO ruling): POST https://api.runware.ai/v1,
// array-of-one task, Bearer RUNWARE_API_KEY. `airId` is the Runware AIR
// identifier sent as the task `model` field; `id` is the Runware docs slug
// used as model_id in the UI / log / CLI. Every airId below was verified
// live (status "live") in https://runware.ai/docs/models/index.json on
// 2026-11-22 — see D:\gh-audits\1122-815\PLAN.md for the check output.
//
// Pure module: no env access, no I/O — safe to import from client and
// server code. hasKey is computed server-side by the caller.

export type ImageGenSize = { width: number; height: number };

export type ImageGenRegistryEntry = {
  id: string;
  label: string;
  provider: "runware";
  airId: string | null;
  price_usd_est: number | null;
  nativeSizes: readonly ImageGenSize[];
  defaultSize: ImageGenSize;
  requiredKeyName: string;
  enabled: boolean;
  notes: string | null;
};

const DEFAULT_SIZE: ImageGenSize = { width: 1024, height: 1024 };

// FLUX.1.1 [pro] / [pro] Ultra — schema: w/h int 256–1440, multipleOf 32.
const BFL_PRO_SIZES: readonly ImageGenSize[] = [
  { width: 512, height: 512 },
  { width: 640, height: 640 },
  { width: 768, height: 768 },
  { width: 1024, height: 1024 },
  { width: 1152, height: 864 },
  { width: 864, height: 1152 },
  { width: 1248, height: 832 },
  { width: 832, height: 1248 },
  { width: 1344, height: 768 },
  { width: 768, height: 1344 },
  { width: 1344, height: 576 },
  { width: 576, height: 1344 },
];

// Kontext [pro] / [max] — schema w/h unconstrained integers; same preset
// list plus the 1568x672 panorama the previous pipeline defaulted to.
const BFL_KONTEXT_SIZES: readonly ImageGenSize[] = [
  ...BFL_PRO_SIZES,
  { width: 1568, height: 672 },
  { width: 672, height: 1568 },
];

// FLUX.1 [schnell] — schema: w/h int 128–2048, multipleOf 64.
const SCHNELL_SIZES: readonly ImageGenSize[] = [
  { width: 512, height: 512 },
  { width: 640, height: 640 },
  { width: 768, height: 768 },
  { width: 1024, height: 1024 },
  { width: 1152, height: 1152 },
  { width: 1280, height: 1280 },
  { width: 1216, height: 832 },
  { width: 832, height: 1216 },
  { width: 1408, height: 896 },
  { width: 896, height: 1408 },
];

export const IMAGE_GEN_REGISTRY: readonly ImageGenRegistryEntry[] = [
  {
    id: "bfl-flux-1-kontext-pro",
    label: "FLUX.1 Kontext [pro]",
    provider: "runware",
    airId: "bfl:3@1",
    price_usd_est: 0.04,
    nativeSizes: BFL_KONTEXT_SIZES,
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: true,
    notes: null,
  },
  {
    id: "bfl-flux-1-1-pro",
    label: "FLUX.1.1 [pro]",
    provider: "runware",
    airId: "bfl:2@1",
    price_usd_est: 0.04,
    nativeSizes: BFL_PRO_SIZES,
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: true,
    notes: null,
  },
  {
    id: "bfl-flux-1-1-pro-ultra",
    label: "FLUX.1.1 [pro] Ultra",
    provider: "runware",
    airId: "bfl:2@2",
    price_usd_est: 0.06,
    nativeSizes: BFL_PRO_SIZES,
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: true,
    notes: null,
  },
  {
    id: "bfl-flux-1-kontext-max",
    label: "FLUX.1 Kontext [max]",
    provider: "runware",
    airId: "bfl:4@1",
    price_usd_est: 0.08,
    nativeSizes: BFL_KONTEXT_SIZES,
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: true,
    notes: "fallback",
  },
  {
    id: "bfl-flux-1-schnell",
    label: "FLUX.1 [schnell]",
    provider: "runware",
    airId: "runware:100@1",
    price_usd_est: 0.0006,
    nativeSizes: SCHNELL_SIZES,
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: true,
    notes: null,
  },
  {
    id: "reve-image",
    label: "Reve Image",
    provider: "runware",
    airId: null,
    price_usd_est: 0.25,
    nativeSizes: [{ width: 1024, height: 1024 }],
    defaultSize: DEFAULT_SIZE,
    requiredKeyName: "RUNWARE_API_KEY",
    enabled: false,
    notes: "AIR pending from owner",
  },
];

export function getImageGenModel(id: string): ImageGenRegistryEntry | undefined {
  return IMAGE_GEN_REGISTRY.find((m) => m.id === id);
}
