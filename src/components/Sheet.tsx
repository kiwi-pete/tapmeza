'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Set false while a save is in flight so the sheet cannot be dismissed mid-request. */
  canClose?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Bottom sheet used for every "open, change, confirm" step: the cart, and the Admin Portal's edit forms. */
export default function Sheet({ title, subtitle, onClose, canClose = true, children, footer }: SheetProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canClose) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [canClose, onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={() => {
          if (canClose) onClose();
        }}
        className="absolute inset-0 animate-fade-in bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-xl animate-sheet-up flex-col rounded-t-2xl bg-surface"
      >
        <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
          <div className="min-w-0">
            <h2 id="sheet-title" className="text-lg font-bold">
              {title}
            </h2>
            {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={!canClose} aria-label="Close" className="icon-btn">
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>
  );
}
