import { fetchOpenRouterModels } from "@/server/openrouter";
import { CatalogAddButton } from "./CatalogAddButton";

export const dynamic = "force-dynamic";

// Add-AI catalog: sortable, paginated OpenRouter model catalog with a
// multi-select provider filter (AIP-BUILD-PRODASHBOARD-FULLUIX-002).
// Source of truth for the catalog: fetchOpenRouterModels() (live OpenRouter
// API). The OpenRouter catalog API exposes no logo field, so no logos shown.

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function pricePerMillion(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n * 1e6 : null;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const catalog = await fetchOpenRouterModels();

  const sort = getParam(searchParams, "sort") || "name";
  const dirRaw = getParam(searchParams, "dir") || "asc";
  const dir: "asc" | "desc" = dirRaw === "desc" ? "desc" : "asc";
  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const providersParam = getParam(searchParams, "providers") || "";
  const selectedProviders = providersParam
    ? providersParam.split(",").filter(Boolean)
    : [];

  // Providers actually present in the live catalog (derived, not hardcoded).
  const providerCounts = new Map<string, number>();
  for (const m of catalog) {
    const provider = m.id.split("/")[0] || "unknown";
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  }
  const allProviders = [...providerCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  let filtered = catalog;
  if (selectedProviders.length > 0) {
    filtered = filtered.filter((m) =>
      selectedProviders.includes(m.id.split("/")[0] || "unknown")
    );
  }

  const priceOf = (m: (typeof catalog)[number]): number =>
    pricePerMillion(m.pricing?.prompt) ?? Number.POSITIVE_INFINITY;
  filtered = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sort === "provider") {
      cmp = a.id.split("/")[0].localeCompare(b.id.split("/")[0]);
    } else if (sort === "price") {
      cmp = priceOf(a) - priceOf(b);
    } else {
      cmp = a.name.localeCompare(b.name);
    }
    return dir === "desc" ? -cmp : cmp;
  });

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  function makeLink(updates: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (sort) params.set("sort", sort);
    if (dirRaw) params.set("dir", dirRaw);
    if (providersParam) params.set("providers", providersParam);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return `/admin/dashboard/catalog${qs ? `?${qs}` : ""}`;
  }

  function sortLink(column: string): string {
    const nextDir = sort === column ? (dir === "desc" ? "asc" : "desc") : "asc";
    return makeLink({ sort: column, dir: nextDir, page: undefined });
  }

  function sortIndicator(column: string): string {
    return sort === column ? (dir === "desc" ? " ↓" : " ↑") : "";
  }

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Add AI</h1>
          <p className="ops-pagesub">
            {catalog.length} models available from the OpenRouter catalog ·{" "}
            {totalCount} shown
          </p>
        </div>
      </header>

      <form
        method="get"
        action="/admin/dashboard/catalog"
        className="ops-panel ops-panel-pad"
        style={{ marginBottom: 16 }}
      >
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dirRaw} />
        <p className="ops-kpi-label" style={{ marginBottom: 8, fontWeight: 600 }}>
          Providers
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {allProviders.map(([provider, count]) => (
            <label
              key={provider}
              className="flex items-center gap-1 text-sm text-gh-text"
            >
              <input
                type="checkbox"
                name="providers"
                value={provider}
                defaultChecked={selectedProviders.includes(provider)}
              />
              {provider} ({count})
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="submit" className="ops-btn ops-btn-primary">
            Apply filter
          </button>
          <a
            href={makeLink({ providers: undefined, page: undefined })}
            className="ops-btn"
          >
            Clear
          </a>
        </div>
      </form>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>
                <a href={sortLink("name")}>Model{sortIndicator("name")}</a>
              </th>
              <th>
                <a href={sortLink("provider")}>
                  Provider{sortIndicator("provider")}
                </a>
              </th>
              <th className="num">
                <a href={sortLink("price")}>
                  Input $/M tok{sortIndicator("price")}
                </a>
              </th>
              <th className="num">Output $/M tok</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => {
              const provider = m.id.split("/")[0] || "unknown";
              const inputPrice = pricePerMillion(m.pricing?.prompt);
              const outputPrice = pricePerMillion(m.pricing?.completion);
              return (
                <tr key={m.id}>
                  <td data-label="Model">
                    <div className="ops-truncate" title={m.id}>
                      {m.name}
                    </div>
                    <div className="ops-mono ops-truncate" title={m.id} style={{ color: "var(--ops-mute)" }}>
                      {m.id}
                    </div>
                  </td>
                  <td data-label="Provider">{provider}</td>
                  <td className="num" data-label="Input $/M tok">
                    {inputPrice != null ? `$${inputPrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="num" data-label="Output $/M tok">
                    {outputPrice != null ? `$${outputPrice.toFixed(2)}` : "—"}
                  </td>
                  <td data-label="Actions">
                    <CatalogAddButton
                      modelId={m.id}
                      name={m.name}
                      provider={provider}
                    />
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  No catalog models match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="ops-pagination">
          {page > 1 ? (
            <a className="ops-btn" href={makeLink({ page: String(page - 1) })}>
              Previous
            </a>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <a className="ops-btn" href={makeLink({ page: String(page + 1) })}>
              Next
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
