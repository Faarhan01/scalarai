import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface ModalProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  children: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({ children, open = false, onClose, title, size = "md", className = "", ...props }, ref) => {
    useEffect(() => {
      if (!open) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && onClose) {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const sizeClass = {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-2xl",
    }[size];

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          ref={ref}
          className={`modal-container ${sizeClass} w-full ${className}`}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {title && (
            <div className="modal-header">
              <h2 className="modal-title">{title}</h2>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="modal-close-btn"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4 text-slate-400 hover:text-white transition-colors" />
                </button>
              )}
            </div>
          )}
          <div className="modal-body">{children}</div>
        </div>
      </div>
    );
  }
);
Modal.displayName = "Modal";

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}
export const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`modal-footer ${className}`} {...props}>
      {children}
    </div>
  )
);
ModalFooter.displayName = "ModalFooter";
