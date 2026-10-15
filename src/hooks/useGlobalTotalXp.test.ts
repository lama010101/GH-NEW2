import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Mock supabaseBrowser before importing the hook.
// The mock is hoisted by vitest above all imports.
const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, from };
});

vi.mock("@/core/supabaseBrowser", () => ({
  supabaseBrowser: { from: mocks.from },
}));

import { useGlobalTotalXp } from "./useGlobalTotalXp";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("useGlobalTotalXp", () => {
  it("queries player_global_stats.total_xp for the given player", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { total_xp: 1234 }, error: null });
    renderHook(() => useGlobalTotalXp("player-1"));
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalled());
    expect(mocks.from).toHaveBeenCalledWith("player_global_stats");
    expect(mocks.select).toHaveBeenCalledWith("total_xp");
    expect(mocks.eq).toHaveBeenCalledWith("player_id", "player-1");
  });

  it("starts pending, then resolves ready with the total_xp value", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { total_xp: 1234 }, error: null });
    const { result } = renderHook(() => useGlobalTotalXp("player-1"));
    expect(result.current).toEqual({ status: "pending", totalXp: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.totalXp).toBe(1234);
  });

  it("is unavailable when there is no playerId", async () => {
    const { result } = renderHook(() => useGlobalTotalXp(null));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.totalXp).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("is unavailable when no row exists", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useGlobalTotalXp("player-1"));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.totalXp).toBeNull();
  });

  it("is unavailable on query error", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useGlobalTotalXp("player-1"));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.totalXp).toBeNull();
  });

  it("is unavailable when the query throws", async () => {
    mocks.maybeSingle.mockRejectedValue(new Error("network fail"));
    const { result } = renderHook(() => useGlobalTotalXp("player-1"));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.totalXp).toBeNull();
  });

  it("does not set state when unmounted before the query resolves", async () => {
    let resolveQuery: (v: { data: { total_xp: number } | null; error: null }) => void = () => {};
    mocks.maybeSingle.mockReturnValue(
      new Promise((res) => {
        resolveQuery = res;
      })
    );
    const { result, unmount } = renderHook(() => useGlobalTotalXp("player-1"));
    expect(result.current.status).toBe("pending");
    unmount();
    await act(async () => {
      resolveQuery({ data: { total_xp: 42 }, error: null });
    });
    expect(result.current.status).toBe("pending");
    expect(result.current.totalXp).toBeNull();
  });
});
