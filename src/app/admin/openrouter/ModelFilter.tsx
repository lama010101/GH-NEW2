"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ModelFilter({ options }: { options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get("model") || "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        const value = e.target.value;
        if (value) {
          params.set("model", value);
          params.delete("page");
        } else {
          params.delete("model");
          params.delete("page");
        }
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-2 text-sm text-gh-text"
    >
      <option value="">All models</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
