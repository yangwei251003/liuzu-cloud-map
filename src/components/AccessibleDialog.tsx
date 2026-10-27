"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export function AccessibleDialog({
  children,
  onClose,
  labelledBy,
  describedBy,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      const target = returnFocusRef.current;
      window.requestAnimationFrame(() => target?.focus());
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`accessible-modal-dialog max-h-[92dvh] overflow-y-auto border border-white/50 bg-[#fffaf0] p-0 text-[#173f35] shadow-[0_28px_90px_rgba(14,44,36,.32)] ${className ?? ""}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}
    >
      {children}
    </dialog>
  );
}
