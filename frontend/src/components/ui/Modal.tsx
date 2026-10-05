import React from "react";

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({ children, open, onClose, ...props }, ref) => {
    if (!open) return null;
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    );
  }
);

Modal.displayName = "Modal";
