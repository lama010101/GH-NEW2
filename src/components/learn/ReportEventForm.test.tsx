import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => {
  const make = () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  };
  return { useTranslations: () => make() };
});

const mockUseIdentity = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useIdentity", () => ({ useIdentity: mockUseIdentity }));

import { ReportEventForm } from "./ReportEventForm";

// EVT-BUILD-REPORTFORM-1118-608 — component coverage: idle trigger,
// expand, submit success (+deduped), every route error class, and the
// hidden case for users the route rejects (no session -> 401).

const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

function identityState(status: string, isAnonymous = false) {
  if (status === "ready") {
    return {
      state: {
        status: "ready",
        playerId: PLAYER_ID,
        isAnonymous,
        displayName: "Player",
        avatarUrl: null,
        isNewUser: false,
      },
      playerId: PLAYER_ID,
      displayName: "Player",
      avatarUrl: null,
      isReady: true,
      isLoading: false,
      error: null,
    };
  }
  return {
    state: { status },
    playerId: null,
    displayName: null,
    avatarUrl: null,
    isReady: false,
    isLoading: status === "loading",
    error: status === "error" ? "boom" : null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetchResponse(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(jsonResponse(status, body));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  mockUseIdentity.mockReturnValue(identityState("ready"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReportEventForm", () => {
  it("renders only the low-emphasis trigger when identity is ready", () => {
    render(<ReportEventForm eventId={EVENT_ID} />);
    expect(screen.getByText("learn_report_open")).toBeTruthy();
    expect(screen.queryByLabelText("learn_report_reason_other")).toBeNull();
  });

  it("shows the trigger to anonymous guests too (route accepts them)", () => {
    mockUseIdentity.mockReturnValue(identityState("ready", true));
    render(<ReportEventForm eventId={EVENT_ID} />);
    expect(screen.getByText("learn_report_open")).toBeTruthy();
  });

  it.each(["unauthenticated", "loading", "error"])(
    "renders nothing when identity status is %s (route would 401)",
    (status) => {
      mockUseIdentity.mockReturnValue(identityState(status));
      const { container } = render(<ReportEventForm eventId={EVENT_ID} />);
      expect(container.firstChild).toBeNull();
    }
  );

  it("expands into the form: 5 reasons, note counter, disabled send", () => {
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));

    for (const r of [
      "wrong_year",
      "wrong_location",
      "not_real_event",
      "misleading_image",
      "other",
    ]) {
      expect(
        screen.getByLabelText(`learn_report_reason_${r}`)
      ).toBeTruthy();
    }
    expect(screen.getByText("0/1000")).toBeTruthy();
    const send = screen.getByText("learn_report_send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText("learn_report_cancel")).toBeTruthy();
  });

  it("updates the live counter as the note is typed", () => {
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.change(screen.getByLabelText("learn_report_note"), {
      target: { value: "abc" },
    });
    expect(screen.getByText("3/1000")).toBeTruthy();
  });

  it("submits the contract body and shows the success state once", async () => {
    const fetchMock = mockFetchResponse(201, {
      ok: true,
      id: "33333333-3333-4333-8333-333333333333",
    });
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.click(
      screen.getByLabelText("learn_report_reason_wrong_year")
    );
    fireEvent.change(screen.getByLabelText("learn_report_note"), {
      target: { value: "  off by a decade  " },
    });
    fireEvent.click(screen.getByText("learn_report_send"));

    await waitFor(() =>
      expect(screen.getByText("learn_report_success")).toBeTruthy()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/event-reports");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      eventId: EVENT_ID,
      reason: "wrong_year",
      details: "off by a decade",
    });
    // Success replaces the form — no way to submit a second report.
    expect(screen.queryByText("learn_report_send")).toBeNull();
    expect(screen.queryByText("learn_report_open")).toBeNull();
  });

  it("treats a deduped 200 response as success", async () => {
    mockFetchResponse(200, { ok: true, deduped: true });
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.click(screen.getByLabelText("learn_report_reason_other"));
    fireEvent.click(screen.getByText("learn_report_send"));
    await waitFor(() =>
      expect(screen.getByText("learn_report_success")).toBeTruthy()
    );
  });

  it.each([
    [400, "learn_report_err_invalid"],
    [401, "learn_report_err_signin"],
    [404, "learn_report_err_notfound"],
    [429, "learn_report_err_ratelimit"],
    [500, "learn_report_err_generic"],
  ])("shows %s -> %s and keeps the form usable", async (status, key) => {
    mockFetchResponse(status, { error: "x" });
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.click(screen.getByLabelText("learn_report_reason_other"));
    fireEvent.click(screen.getByText("learn_report_send"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(key)
    );
    // Form stays expanded for retry; success was not shown.
    expect(screen.queryByText("learn_report_success")).toBeNull();
    expect(screen.getByText("learn_report_send")).toBeTruthy();
  });

  it("shows the generic error when fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.click(screen.getByLabelText("learn_report_reason_other"));
    fireEvent.click(screen.getByText("learn_report_send"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "learn_report_err_generic"
      )
    );
  });

  it("cancel collapses the form back to the trigger", () => {
    render(<ReportEventForm eventId={EVENT_ID} />);
    fireEvent.click(screen.getByText("learn_report_open"));
    fireEvent.click(screen.getByText("learn_report_cancel"));
    expect(screen.queryByLabelText("learn_report_reason_other")).toBeNull();
    expect(screen.getByText("learn_report_open")).toBeTruthy();
  });
});
