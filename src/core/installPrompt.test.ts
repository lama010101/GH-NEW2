import { beforeEach, describe, expect, it, vi } from "vitest";

// installPrompt.ts attaches its beforeinstallprompt capture at module scope
// (PWA-BUILD-INSTALLBTN-1025-002), so every fresh import registers the
// listener. vi.resetModules() + dynamic import gives each test a fresh
// capturedEvent slot.

type StubInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function makeBeforeInstallPromptEvent(overrides?: {
  outcome?: "accepted" | "dismissed";
  promptImpl?: () => Promise<void>;
}) {
  const ev = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as StubInstallPromptEvent;
  ev.prompt = overrides?.promptImpl ?? vi.fn(() => Promise.resolve());
  ev.userChoice = Promise.resolve({ outcome: overrides?.outcome ?? "accepted" });
  return ev;
}

function dispatchBeforeInstallPrompt(overrides?: {
  outcome?: "accepted" | "dismissed";
  promptImpl?: () => Promise<void>;
}) {
  const ev = makeBeforeInstallPromptEvent(overrides);
  window.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  vi.resetModules();
});

describe("installPrompt — PWA-BUILD-INSTALLBTN-1025-002", () => {
  it("importing the module alone (no component mounted) captures beforeinstallprompt and calls preventDefault", async () => {
    const { isInstallAvailable } = await import("./installPrompt");
    const ev = makeBeforeInstallPromptEvent({ outcome: "accepted" });
    const preventDefaultSpy = vi.spyOn(ev, "preventDefault");
    window.dispatchEvent(ev);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    expect(isInstallAvailable()).toBe(true);
  });

  it("promptInstall resolves 'accepted' per userChoice, then isInstallAvailable() is false", async () => {
    const { isInstallAvailable, promptInstall } = await import("./installPrompt");
    dispatchBeforeInstallPrompt({ outcome: "accepted" });
    await expect(promptInstall()).resolves.toBe("accepted");
    expect(isInstallAvailable()).toBe(false);
  });

  it("promptInstall resolves 'dismissed' per userChoice, then isInstallAvailable() is false", async () => {
    const { isInstallAvailable, promptInstall } = await import("./installPrompt");
    dispatchBeforeInstallPrompt({ outcome: "dismissed" });
    await expect(promptInstall()).resolves.toBe("dismissed");
    expect(isInstallAvailable()).toBe(false);
  });

  it("promptInstall resolves 'unavailable' when no event was captured", async () => {
    const { isInstallAvailable, promptInstall } = await import("./installPrompt");
    await expect(promptInstall()).resolves.toBe("unavailable");
    expect(isInstallAvailable()).toBe(false);
  });

  it("promptInstall resolves 'unavailable' when prompt() throws", async () => {
    const { isInstallAvailable, promptInstall } = await import("./installPrompt");
    dispatchBeforeInstallPrompt({
      promptImpl: () => Promise.reject(new Error("prompt failed")),
    });
    await expect(promptInstall()).resolves.toBe("unavailable");
    expect(isInstallAvailable()).toBe(false);
  });
});
