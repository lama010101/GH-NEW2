import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import React from "react";
import en from "@/i18n/en.json";
import {
  FEEDBACK_YEAR_MIN,
  feedbackYearMax,
} from "@/core/eventFeedback";

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

import { EventFeedbackForm } from "./EventFeedbackForm";

// UX-BUILD-EVENTFEEDBACK-1128-925: component coverage for the correction-claim
// form: prefilled canonical values, changed-fields-only submission, signed-year
// validation, image preset/comment requirement, honest success copy, and errors.

const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

const CANONICAL = {
  title: "Current Title",
  description: "Current description",
  year: 1900,
  locationName: "Current Place",
  imageUrl: "https://firebasestorage.googleapis.com/example/image.webp",
};

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

function renderOpenForm() {
  const view = render(<EventFeedbackForm eventId={EVENT_ID} canonical={CANONICAL} />);
  fireEvent.click(screen.getByText("learn_feedback_open"));
  return view;
}

beforeEach(() => {
  mockUseIdentity.mockReturnValue(identityState("ready"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventFeedbackForm", () => {
  it("renders only the correction trigger when identity is ready", () => {
    render(<EventFeedbackForm eventId={EVENT_ID} canonical={CANONICAL} />);
    expect(screen.getByText("learn_feedback_open")).toBeTruthy();
    expect(screen.queryByLabelText("learn_feedback_title")).toBeNull();
  });

  it("shows the trigger to anonymous guests too", () => {
    mockUseIdentity.mockReturnValue(identityState("ready", true));
    render(<EventFeedbackForm eventId={EVENT_ID} canonical={CANONICAL} />);
    expect(screen.getByText("learn_feedback_open")).toBeTruthy();
  });

  it.each(["unauthenticated", "loading", "error"])(
    "renders nothing when identity status is %s",
    (status) => {
      mockUseIdentity.mockReturnValue(identityState(status));
      const { container } = render(
        <EventFeedbackForm eventId={EVENT_ID} canonical={CANONICAL} />
      );
      expect(container.firstChild).toBeNull();
    }
  );

  it("opens with canonical values prefilled, current labels, image, and signed-year hint", () => {
    renderOpenForm();

    expect((screen.getByLabelText("learn_feedback_title") as HTMLInputElement).value).toBe("Current Title");
    expect((screen.getByLabelText("learn_feedback_year") as HTMLInputElement).value).toBe("1900");
    expect((screen.getByLabelText("learn_feedback_location") as HTMLInputElement).value).toBe("Current Place");
    expect((screen.getByLabelText("learn_feedback_description") as HTMLTextAreaElement).value).toBe("Current description");
    expect(screen.getAllByText(/learn_feedback_current/).length).toBeGreaterThan(0);
    expect(screen.getByText("learn_feedback_year_hint")).toBeTruthy();

    const img = screen.getByAltText("Current Title") as HTMLImageElement;
    expect(img.src).toContain("/api/image-proxy?url=");
    for (const reason of [
      "anachronism",
      "wrong_place_culture",
      "wrong_people_objects",
      "does_not_match_description",
      "looks_artificial",
      "offensive_or_inappropriate",
      "other",
    ]) {
      expect(screen.getByText(`learn_feedback_image_reason_${reason}`)).toBeTruthy();
    }
  });

  it("submits only changed fields, with one optional comment per changed field", async () => {
    const fetchMock = mockFetchResponse(201, {
      ok: true,
      items: [{ field: "title", status: "accepted" }],
    });
    const { container } = renderOpenForm();

    fireEvent.change(screen.getByLabelText("learn_feedback_title"), {
      target: { value: "Corrected Title" },
    });
    fireEvent.change(screen.getByLabelText("learn_feedback_year"), {
      target: { value: "1899" },
    });
    fireEvent.change(
      container.querySelector("#event-feedback-comment-title") as Element,
      { target: { value: "Title source note" } }
    );
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByText("learn_feedback_success")).toBeTruthy()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/event-feedback");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      eventId: EVENT_ID,
      items: [
        {
          field: "title",
          proposedValue: "Corrected Title",
          comment: "Title source note",
        },
        { field: "year", proposedValue: "1899" },
      ],
    });
  });

  it("blocks submission when every editable value is still equal to current", async () => {
    const fetchMock = mockFetchResponse(201, { ok: true, items: [] });
    renderOpenForm();
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("learn_feedback_err_nochanges")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-integer and out-of-range signed years before fetch", async () => {
    const fetchMock = mockFetchResponse(201, { ok: true, items: [] });
    renderOpenForm();

    for (const bad of [
      "1900.5",
      String(FEEDBACK_YEAR_MIN - 1),
      String(feedbackYearMax() + 1),
    ]) {
      fireEvent.change(screen.getByLabelText("learn_feedback_year"), {
        target: { value: bad },
      });
      fireEvent.click(screen.getByText("learn_feedback_submit"));
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toBe("learn_feedback_err_invalid")
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("accepts year zero as a signed year", async () => {
    const fetchMock = mockFetchResponse(201, {
      ok: true,
      items: [{ field: "year", status: "accepted" }],
    });
    renderOpenForm();
    fireEvent.change(screen.getByLabelText("learn_feedback_year"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByText("learn_feedback_success")).toBeTruthy()
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).items).toEqual([
      { field: "year", proposedValue: "0" },
    ]);
  });

  it("requires a preset or comment when touched image feedback is submitted empty", async () => {
    const fetchMock = mockFetchResponse(201, { ok: true, items: [] });
    renderOpenForm();
    const chip = screen.getByText("learn_feedback_image_reason_other");
    fireEvent.click(chip);
    fireEvent.click(chip);
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("learn_feedback_err_image_required")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits image feedback with presets and an optional comment", async () => {
    const fetchMock = mockFetchResponse(201, {
      ok: true,
      items: [{ field: "image", status: "accepted" }],
    });
    const { container } = renderOpenForm();
    fireEvent.click(screen.getByText("learn_feedback_image_reason_anachronism"));
    fireEvent.click(screen.getByText("learn_feedback_image_reason_other"));
    fireEvent.change(
      container.querySelector("#event-feedback-comment-image") as Element,
      { target: { value: "The objects look modern." } }
    );
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByText("learn_feedback_success")).toBeTruthy()
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).items).toEqual([
      {
        field: "image",
        imageReasons: ["anachronism", "other"],
        comment: "The objects look modern.",
      },
    ]);
  });

  it("uses honest success copy in the real English locale", () => {
    const copy = en.game.learn_feedback_success;
    expect(copy).toContain("reviewed automatically by AI");
    expect(copy).toContain("not changed without evidence");
    expect(copy).not.toMatch(/verified|validated|checked by humans|confirmed by our team/i);
  });

  it.each([
    [400, "learn_feedback_err_invalid"],
    [401, "learn_feedback_err_signin"],
    [404, "learn_feedback_err_notfound"],
    [429, "learn_feedback_err_ratelimit"],
    [500, "learn_feedback_err_generic"],
  ])("shows %s -> %s and keeps the form usable", async (status, key) => {
    mockFetchResponse(status, { error: "x" });
    renderOpenForm();
    fireEvent.change(screen.getByLabelText("learn_feedback_title"), {
      target: { value: "Corrected Title" },
    });
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(key)
    );
    expect(screen.queryByText("learn_feedback_success")).toBeNull();
    expect(screen.getByText("learn_feedback_submit")).toBeTruthy();
  });

  it("shows the generic error when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderOpenForm();
    fireEvent.change(screen.getByLabelText("learn_feedback_title"), {
      target: { value: "Corrected Title" },
    });
    fireEvent.click(screen.getByText("learn_feedback_submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("learn_feedback_err_generic")
    );
  });
});
