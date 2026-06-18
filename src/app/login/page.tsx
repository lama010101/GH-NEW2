"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AuthModal } from "@/components/AuthModal";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const handleClose = () => {
    router.replace(next);
  };

  return (
    <AuthModal
      isOpen={true}
      onClose={handleClose}
      required={true}
    />
  );
}
