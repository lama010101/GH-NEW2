import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import styles from "./NotificationBell.module.css";
import NotificationBell from "./NotificationBell";

vi.mock("next/navigation", () => {
  const mockRouter = { push: vi.fn() };
  return { useRouter: () => mockRouter };
});

vi.mock("next-intl", () => {
  const messages: Record<string, Record<string, string>> = {
    notifications: {
      title: "Notifications",
      empty: "No notifications",
      just_now: "just now",
      m_ago: "{n}m ago",
      h_ago: "{n}h ago",
      d_ago: "{n}d ago",
      sent: "sent {time}",
      join_game: "Join Game",
      session_complete: "{name} completed the game",
      view_results: "View Results",
      someone: "Someone",
    },
    home: {
      compete_mode_rush: "Live",
      compete_mode_relax: "Anytime",
    },
  };
  function interpolate(template: string, params?: Record<string, string | number>) {
    if (!params) return template;
    return template.replace(/{(\w+)}/g, (_, key) => String(params[key] ?? ""));
  }
  function useTranslations(namespace: string) {
    const ns = messages[namespace] || {};
    return (key: string, params?: Record<string, string | number>) =>
      interpolate(ns[key] ?? key, params);
  }
  return { useTranslations };
});

vi.mock("@/components/home/CompetePanel", () => ({
  acceptInvitation: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function getFetchMock() {
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

async function getRouter() {
  const { useRouter } = await import("next/navigation");
  return (useRouter as any)() as { push: ReturnType<typeof vi.fn> };
}

async function getAcceptInvitation() {
  const { acceptInvitation } = await import("@/components/home/CompetePanel");
  return acceptInvitation as ReturnType<typeof vi.fn>;
}

function buildResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("NotificationBell", () => {
  it("renders the bell button with the correct aria attributes", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    expect(bell).toHaveAttribute("aria-label", "Notifications");
    expect(bell).toHaveAttribute("aria-haspopup", "dialog");
    expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the drawer and sets aria-expanded to true when the bell is clicked", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });
    expect(bell).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the drawer when the Escape key is pressed", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);
    await waitFor(() => {
      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });
    expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer when clicking outside of it", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);
    await waitFor(() => {
      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });
    expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  it("shows read and unread notifications with visual distinction", async () => {
    const fetch = await getFetchMock();
    const notifications = [
      {
        id: "n-read",
        type: "session_complete",
        payload: { completing_player_name: "Bob", game_id: "g1" },
        read: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "n-unread",
        type: "lobby_invite",
        payload: { inviter_name: "Alice", game_id: "g2", invitation_id: "i2", mode: "sync" },
        read: false,
        created_at: new Date().toISOString(),
      },
    ];
    fetch.mockResolvedValue(buildResponse({ notifications, unread_count: 1 }));

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Bob completed the game")).toBeInTheDocument();
      expect(screen.getByText("Alice · Live")).toBeInTheDocument();
    });

    const readItem = screen.getByText("Bob completed the game").parentElement!.parentElement!;
    const unreadItem = screen.getByText("Alice · Live").parentElement!.parentElement!;

    expect(readItem.classList.contains(styles.read)).toBe(true);
    expect(unreadItem.classList.contains(styles.unread)).toBe(true);
  });

  it("marks only the clicked notification as read", async () => {
    const fetch = await getFetchMock();
    const notifications = [
      { id: "n1", type: "generic", payload: {}, read: false, created_at: new Date().toISOString() },
      { id: "n2", type: "generic", payload: {}, read: true, created_at: new Date().toISOString() },
    ];
    fetch.mockImplementation((input: unknown, init?: { method?: string }) => {
      if (input !== "/api/notifications") return { ok: false, json: async () => ({}) };
      if (init?.method === "PATCH") return { ok: true, json: async () => ({ updated: 1 }) };
      return buildResponse({ notifications, unread_count: 1 });
    });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getAllByText("generic").length).toBe(2);
    });

    const items = screen.getAllByText("generic");
    const firstItem = items[0].parentElement!.parentElement!;
    const secondItem = items[1].parentElement!.parentElement!;

    expect(firstItem.classList.contains(styles.unread)).toBe(true);
    expect(secondItem.classList.contains(styles.read)).toBe(true);

    fireEvent.click(items[0]);

    await waitFor(() => {
      expect(firstItem.classList.contains(styles.read)).toBe(true);
    });

    expect(secondItem.classList.contains(styles.read)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ ids: ["n1"] }),
      })
    );
  });

  it("joining a lobby invitation marks only that notification read and navigates to the game", async () => {
    const fetch = await getFetchMock();
    const acceptInvitation = await getAcceptInvitation();
    const router = await getRouter();
    acceptInvitation.mockResolvedValue({ ok: true });

    const notifications = [
      {
        id: "n-inv",
        type: "lobby_invite",
        payload: { inviter_name: "Alice", game_id: "g1", invitation_id: "inv1", mode: "sync" },
        read: false,
        created_at: new Date().toISOString(),
      },
      { id: "n-other", type: "generic", payload: {}, read: false, created_at: new Date().toISOString() },
    ];
    fetch.mockImplementation((input: unknown, init?: { method?: string }) => {
      if (input !== "/api/notifications") return { ok: false, json: async () => ({}) };
      if (init?.method === "PATCH") return { ok: true, json: async () => ({ updated: 1 }) };
      return buildResponse({ notifications, unread_count: 2 });
    });

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Join Game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Join Game/i }));

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith("inv1");
    });
    expect(router.push).toHaveBeenCalledWith("/compete/g1");

    await waitFor(() => {
      expect(screen.queryByText("Join Game")).not.toBeInTheDocument();
    });

    const patchCalls = (fetch.mock.calls as Array<[string, { method?: string; body?: string }]>).filter(
      ([, init]) => init?.method === "PATCH"
    );
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0][1].body).toBe(JSON.stringify({ ids: ["n-inv"] }));
  });

  it("renders lobby_invite time using the sent {time} pattern without crashing", async () => {
    const fetch = await getFetchMock();
    const createdAt = new Date(Date.now() - 1000).toISOString();
    fetch.mockResolvedValue(
      buildResponse({
        notifications: [
          {
            id: "n-time",
            type: "lobby_invite",
            payload: { inviter_name: "Alice", game_id: "g1", invitation_id: "i1", mode: "sync" },
            read: false,
            created_at: createdAt,
          },
        ],
        unread_count: 1,
      })
    );

    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: /Notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("sent just now")).toBeInTheDocument();
      expect(screen.getByText("Alice · Live")).toBeInTheDocument();
    });
  });

  it("displays the unread count returned by the notifications API", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue(buildResponse({ notifications: [], unread_count: 5 }));

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("caps the unread badge at 9+", async () => {
    const fetch = await getFetchMock();
    fetch.mockResolvedValue(buildResponse({ notifications: [], unread_count: 12 }));

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByText("9+")).toBeInTheDocument();
    });
  });
});
