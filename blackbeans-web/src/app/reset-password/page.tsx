"use client";

import { Spin } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const RESET_TOKEN_STORAGE_KEY = "bb_password_reset_token";

function ResetPasswordRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = (searchParams.get("token") || "").trim();
    if (!token) {
      router.replace("/");
      return;
    }
    // Evita token longo/fragil no hash; AuthPanel le do sessionStorage.
    try {
      sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore quota / private mode
    }
    window.location.replace("/#reset");
  }, [router, searchParams]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Spin size="large" description="Abrindo redefinicao de senha..." />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          <Spin size="large" />
        </div>
      }
    >
      <ResetPasswordRedirect />
    </Suspense>
  );
}
