"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addAiPlayer } from "./actions";

type CatalogModel = {
  id: string;
  name: string;
  pricing: { prompt: string | null; completion: string | null } | null;
};

export function AddModelModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isOpen = searchParams.get("addModel") === "1";

  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCatalog([]);
      setCatalogLoading(false);
      setCatalogError(null);
      setSearch("");
      setSelectedModelId("");
      setName("");
      setProvider("");
      setAvatarUrl("");
      setSubmitting(false);
      setSubmitError(null);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    fetch("/api/admin/dashboard/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
        return res.json() as Promise<{ models: CatalogModel[] }>;
      })
      .then((data) => {
        if (!cancelled) setCatalog(data.models ?? []);
      })
      .catch((e) => {
        if (!cancelled)
          setCatalogError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("addModel");
    router.push(`${pathname}?${params.toString()}`);
  };

  const filtered = search.trim()
    ? catalog.filter(
        (m) =>
          m.id.toLowerCase().includes(search.toLowerCase()) ||
          m.name.toLowerCase().includes(search.toLowerCase())
      )
    : catalog;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelId || !name.trim() || !provider.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addAiPlayer({
        name: name.trim(),
        provider: provider.trim(),
        model_id: selectedModelId,
        avatar_url: avatarUrl.trim() || null,
      });
      close();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-6 text-gh-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Add AI model</h2>
          <button
            onClick={close}
            className="text-gh-text-sec hover:text-gh-text"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-gh-text-sec">Model</label>
            <input
              type="text"
              placeholder="Search OpenRouter catalog…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 w-full rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-3 py-2 text-gh-text"
            />
            {catalogLoading && (
              <p className="text-gh-text-sec">Loading catalog…</p>
            )}
            {catalogError && (
              <p className="text-red-500">{catalogError}</p>
            )}
            {!catalogLoading && !catalogError && (
              <select
                size={6}
                value={selectedModelId}
                onChange={(e) => {
                  setSelectedModelId(e.target.value);
                  const found = catalog.find((m) => m.id === e.target.value);
                  if (found && !name) setName(found.name);
                  if (found && !provider) {
                    const prov = found.id.split("/")[0];
                    if (prov) setProvider(prov);
                  }
                }}
                className="w-full rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-3 py-2 text-gh-text"
              >
                {filtered.slice(0, 100).map((m) => {
                  const promptPrice = m.pricing?.prompt;
                  const priceLabel =
                    promptPrice && promptPrice !== "0"
                      ? ` · $${(parseFloat(promptPrice) * 1e6).toFixed(2)}/M tok`
                      : "";
                  return (
                    <option key={m.id} value={m.id}>
                      {m.id}{priceLabel}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedModelId && (
              <p className="mt-1 text-xs text-gh-text-sec">
                Selected: {selectedModelId}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-gh-text-sec">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-3 py-2 text-gh-text"
            />
          </div>

          <div>
            <label className="mb-1 block text-gh-text-sec">Provider</label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              required
              className="w-full rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-3 py-2 text-gh-text"
            />
          </div>

          <div>
            <label className="mb-1 block text-gh-text-sec">
              Avatar URL (optional)
            </label>
            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-3 py-2 text-gh-text"
            />
          </div>

          {submitError && (
            <p className="text-red-500">{submitError}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded border border-[var(--gh-border-default)] px-4 py-2 text-gh-text-sec hover:text-gh-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedModelId || !name.trim() || !provider.trim()}
              className="rounded bg-gh-text px-4 py-2 text-gh-bg-base disabled:opacity-50"
            >
              {submitting ? "Adding…" : "Add model"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
