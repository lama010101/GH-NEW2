"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/hooks/useIdentity";

export type UseAuthGateReturn = {
  requireAuth: (nextPath: string) => void;
  isModalOpen: boolean;
  closeModal: () => void;
};

export function useAuthGate(): UseAuthGateReturn {
  const router = useRouter();
  const { state } = useIdentity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pendingRef = useRef<string | null>(null);

  const requireAuth = useCallback(
    (nextPath: string) => {
      if (state.status === "ready") {
        router.push(nextPath);
        return;
      }

      pendingRef.current = nextPath;
      setIsModalOpen(true);
    },
    [state.status, router]
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  useEffect(() => {
    if (state.status === "ready" && pendingRef.current) {
      const next = pendingRef.current;
      pendingRef.current = null;
      router.push(next);
    }
  }, [state.status, router]);

  return { requireAuth, isModalOpen, closeModal };
}
