"use client";

import { useRouter } from "next/navigation";

export function PaymentDetailSheet({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <>
      {/* Backdrop — desktop only via CSS */}
      <div
        className="fp-sheet-backdrop"
        onClick={() => router.back()}
        aria-hidden
      />

      {/* Panel */}
      <div className="fp-sheet-panel">
        {/* Close button — desktop only via CSS */}
        <button
          type="button"
          className="fp-sheet-close-btn"
          onClick={() => router.back()}
          aria-label="Close"
        >
          <svg
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Content */}
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </>
  );
}
