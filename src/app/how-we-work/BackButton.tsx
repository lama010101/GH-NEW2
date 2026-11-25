"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  label: string;
  className?: string;
}

export function BackButton({ label, className }: BackButtonProps) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
      aria-label={label}
    >
      ← {label}
    </button>
  );
}
