import { getDbPool } from "@/server/db";
import { fetchUsersList } from "../queries";

export const dynamic = "force-dynamic";

// Users table view (AIP-BUILD-PRODASHBOARD-FULLUIX-002).
// Source: profiles LEFT JOIN auth.users (email) via the service-role pool.

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pool = getDbPool();

  const sort = getParam(searchParams, "sort") || "created_at";
  const dirRaw = getParam(searchParams, "dir") || "desc";
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";
  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await fetchUsersList(pool, {
    sort,
    dir,
    limit: PAGE_SIZE,
    offset,
  });

  const totalCount = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function makeLink(updates: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("dir", dirRaw);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return `/admin/dashboard/users${qs ? `?${qs}` : ""}`;
  }

  function sortLink(column: string): string {
    const nextDir = sort === column ? (dir === "desc" ? "asc" : "desc") : column === "display_name" || column === "email" ? "asc" : "desc";
    return makeLink({ sort: column, dir: nextDir, page: undefined });
  }

  function sortIndicator(column: string): string {
    return sort === column ? (dir === "desc" ? " ↓" : " ↑") : "";
  }

  return (
    <section>
      <h1 className="mb-1 text-lg font-semibold">Users</h1>
      <p className="mb-4 text-sm text-gh-text-sec">
        {totalCount.toLocaleString()} registered users
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
              <th className="px-4 py-3 font-semibold">
                <a href={sortLink("display_name")}>
                  Display name{sortIndicator("display_name")}
                </a>
              </th>
              <th className="px-4 py-3 font-semibold">
                <a href={sortLink("email")}>Email{sortIndicator("email")}</a>
              </th>
              <th className="px-4 py-3 font-semibold">
                <a href={sortLink("role")}>Role{sortIndicator("role")}</a>
              </th>
              <th className="px-4 py-3 font-semibold">
                <a href={sortLink("created_at")}>
                  Joined{sortIndicator("created_at")}
                </a>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.id}
                className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-3">{u.display_name || "—"}</td>
                <td className="px-4 py-3 text-gh-text-sec">{u.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      u.role === "admin"
                        ? "bg-[var(--gh-gold-rgb)] text-gh-text"
                        : "bg-gh-bg-base text-gh-text-sec"
                    }`}
                    style={
                      u.role === "admin"
                        ? { background: "rgba(var(--gh-gold-rgb), 0.2)" }
                        : undefined
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                  {u.created_at
                    ? new Date(u.created_at).toLocaleDateString("en-US", {
                        dateStyle: "medium",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-gh-text-sec" colSpan={4}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <a
              className="text-gh-text-sec hover:text-gh-text"
              href={makeLink({ page: String(page - 1) })}
            >
              ← Previous
            </a>
          ) : (
            <span />
          )}
          <span className="text-gh-text-sec">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <a
              className="text-gh-text-sec hover:text-gh-text"
              href={makeLink({ page: String(page + 1) })}
            >
              Next →
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </section>
  );
}
