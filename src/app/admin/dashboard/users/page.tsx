import { getDbPool } from "@/server/db";
import { fetchUsersList } from "../queries";
import { RecordDrawer, type DrawerField } from "../components/RecordDrawer";

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

  // Shared RecordDrawer state (?drawer=<userId>).
  const drawerId = getParam(searchParams, "drawer");
  const drawerRow = drawerId ? rows.find((u) => u.id === drawerId) ?? null : null;
  const drawerCloseHref = makeLink({ drawer: undefined });
  const drawerFields: DrawerField[] | undefined = drawerRow
    ? [
        { label: "User ID", value: drawerRow.id, mono: true },
        { label: "Email", value: drawerRow.email ?? "—" },
        { label: "Role", value: drawerRow.role },
        {
          label: "Joined",
          value: drawerRow.created_at
            ? new Date(drawerRow.created_at).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })
            : "—",
        },
      ]
    : undefined;

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Users</h1>
          <p className="ops-pagesub">
            {totalCount.toLocaleString()} registered users
          </p>
        </div>
      </header>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>
                <a href={sortLink("display_name")}>
                  Display name{sortIndicator("display_name")}
                </a>
              </th>
              <th>
                <a href={sortLink("email")}>Email{sortIndicator("email")}</a>
              </th>
              <th>
                <a href={sortLink("role")}>Role{sortIndicator("role")}</a>
              </th>
              <th>
                <a href={sortLink("created_at")}>
                  Joined{sortIndicator("created_at")}
                </a>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td data-label="Display name">
                  <a
                    href={makeLink({ drawer: u.id })}
                    className="ops-celllink"
                    title="Open record"
                  >
                    <span className="ops-cellname">
                      <span className="ops-truncate">{u.display_name || "—"}</span>
                    </span>
                  </a>
                </td>
                <td data-label="Email" style={{ color: "var(--ops-mute)" }}>
                  {u.email ?? "—"}
                </td>
                <td data-label="Role">
                  <span
                    className={`ops-chip ${
                      u.role === "admin" ? "ops-chip-warn" : "ops-chip-muted"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td data-label="Joined" style={{ color: "var(--ops-mute)" }}>
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
                <td colSpan={4}>
                  No users found.
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

      <RecordDrawer
        open={drawerRow != null}
        closeHref={drawerCloseHref}
        title={drawerRow?.display_name || "User"}
        fields={drawerFields}
      />
    </div>
  );
}
