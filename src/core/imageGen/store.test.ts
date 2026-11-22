import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// EDQ-BUILD-ADMINGEN-1122-815 — storage adapter tests. Supabase client and
// fetch are mocked; no network, no credentials.

const mockFns = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createSupabaseServerClient: mockFns.createSupabaseServerClient,
}));

import {
  sniffImageContentType,
  storeGeneratedEventImage,
  uploadToEventImagesBucket,
  EVENT_IMAGES_BUCKET,
} from "./store";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const UNKNOWN = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function makeSupabase(opts: {
  buckets?: { id: string }[];
  uploadError?: { message: string } | null;
}) {
  const upload = vi.fn().mockResolvedValue({ error: opts.uploadError ?? null });
  const getPublicUrl = vi.fn().mockReturnValue({
    data: { publicUrl: `https://supa.example/storage/v1/object/public/${EVENT_IMAGES_BUCKET}/events/e1/l1.jpg` },
  });
  const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
  return {
    client: {
      storage: {
        listBuckets: vi.fn().mockResolvedValue({ data: opts.buckets ?? [], error: null }),
        createBucket: vi.fn().mockResolvedValue({ error: null }),
        from,
      },
    },
    upload,
    getPublicUrl,
    from,
  };
}

describe("sniffImageContentType", () => {
  it("detects jpeg/png/webp/gif magic bytes", () => {
    expect(sniffImageContentType(JPEG)).toBe("image/jpeg");
    expect(sniffImageContentType(PNG)).toBe("image/png");
    expect(sniffImageContentType(WEBP)).toBe("image/webp");
    expect(sniffImageContentType(GIF)).toBe("image/gif");
    expect(sniffImageContentType(UNKNOWN)).toBeNull();
    expect(sniffImageContentType(new Uint8Array([]))).toBeNull();
  });
});

describe("storeGeneratedEventImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JPEG, { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fetches bytes, uploads to events/<scope>/<image>.jpg, returns public URL + path", async () => {
    const s = makeSupabase({ buckets: [{ id: EVENT_IMAGES_BUCKET }] });
    mockFns.createSupabaseServerClient.mockReturnValue(s.client);

    const r = await storeGeneratedEventImage({
      scopeId: "evt-1",
      imageId: "log-1",
      providerUrl: "https://provider.example/i.jpg?sig=secret",
    });

    expect(r.storagePath).toBe("events/evt-1/log-1.jpg");
    expect(r.contentType).toBe("image/jpeg");
    expect(r.publicUrl).toContain("/event-images/");
    expect(r.byteLength).toBe(JPEG.length);
    expect(s.from).toHaveBeenCalledWith(EVENT_IMAGES_BUCKET);
    const [path, bytes, opts] = s.upload.mock.calls[0] as [
      string,
      Uint8Array,
      Record<string, unknown>,
    ];
    expect(path).toBe("events/evt-1/log-1.jpg");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(opts.contentType).toBe("image/jpeg");
    expect(opts.cacheControl).toBe("31536000");
    expect(opts.upsert).toBe(false);
  });

  it("creates the bucket when absent", async () => {
    const s = makeSupabase({ buckets: [] });
    mockFns.createSupabaseServerClient.mockReturnValue(s.client);
    await storeGeneratedEventImage({
      scopeId: "e", imageId: "i", providerUrl: "https://x/i.jpg",
    });
    expect(s.client.storage.createBucket).toHaveBeenCalledWith(
      EVENT_IMAGES_BUCKET,
      { public: true }
    );
  });

  it("throws on unrecognized bytes without uploading", async () => {
    fetchMock.mockResolvedValue(new Response(UNKNOWN, { status: 200 }));
    const s = makeSupabase({});
    mockFns.createSupabaseServerClient.mockReturnValue(s.client);
    await expect(
      storeGeneratedEventImage({ scopeId: "e", imageId: "i", providerUrl: "https://x/i" })
    ).rejects.toThrow(/unrecognized/);
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("throws status-only error on provider fetch failure", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    const s = makeSupabase({});
    mockFns.createSupabaseServerClient.mockReturnValue(s.client);
    await expect(
      storeGeneratedEventImage({ scopeId: "e", imageId: "i", providerUrl: "https://x/i" })
    ).rejects.toThrow("HTTP 403");
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("uploadToEventImagesBucket surfaces storage errors", async () => {
    const s = makeSupabase({ uploadError: { message: "boom" } });
    mockFns.createSupabaseServerClient.mockReturnValue(s.client);
    await expect(
      uploadToEventImagesBucket("_smoke/x.jpg", JPEG, "image/jpeg")
    ).rejects.toThrow(/storage upload failed/);
  });
});
