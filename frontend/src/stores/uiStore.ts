import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type PanelId = 'launcher' | 'notifications' | 'quickSettings' | 'clock';

export interface MenuItem {
  id?: string;
  label?: string;
  icon?: LucideIcon;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  onSelect?: () => void;
  /** Nested items, rendered as a flyout. */
  children?: MenuItem[];
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  /** Optional third choice (e.g. "Discard"). */
  altLabel?: string;
  resolve: (v: 'confirm' | 'alt' | 'cancel') => void;
}

export interface PromptRequest {
  id: number;
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  /** Mask the input (passwords). */
  secret: boolean;
  validate?: (v: string) => string | null;
  resolve: (v: string | null) => void;
}

interface UiStore {
  panel: PanelId | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  togglePanel: (p: PanelId) => void;
  openPanel: (p: PanelId) => void;
  closePanel: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;
}

export const useUi = create<UiStore>((set) => ({
  panel: null,
  menu: null,
  confirm: null,
  prompt: null,
  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p, menu: null })),
  openPanel: (p) => set({ panel: p, menu: null }),
  closePanel: () => set({ panel: null }),
  openMenu: (x, y, items) => set({ menu: { x, y, items }, panel: null }),
  closeMenu: () => set({ menu: null }),
}));

let seq = 0;

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Promise-based confirmation dialog, rendered by <DialogHost/> at shell level. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.setState({
      confirm: {
        id: ++seq,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        danger: !!opts.danger,
        resolve: (v) => {
          useUi.setState({ confirm: null });
          resolve(v === 'confirm');
        },
      },
    });
  });
}

/** Three-way dialog, e.g. Save / Discard / Cancel. */
export function choiceDialog(opts: ConfirmOptions & { altLabel: string }): Promise<'confirm' | 'alt' | 'cancel'> {
  return new Promise((resolve) => {
    useUi.setState({
      confirm: {
        id: ++seq,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Save',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        danger: !!opts.danger,
        altLabel: opts.altLabel,
        resolve: (v) => {
          useUi.setState({ confirm: null });
          resolve(v);
        },
      },
    });
  });
}

export function promptDialog(opts: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  secret?: boolean;
  validate?: (v: string) => string | null;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useUi.setState({
      prompt: {
        id: ++seq,
        title: opts.title,
        label: opts.label,
        initial: opts.initial ?? '',
        confirmLabel: opts.confirmLabel ?? 'OK',
        secret: !!opts.secret,
        validate: opts.validate,
        resolve: (v) => {
          useUi.setState({ prompt: null });
          resolve(v);
        },
      },
    });
  });
}
