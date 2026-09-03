"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import "./toast.css";

/** Rightward drag distance, in pixels, past which releasing dismisses the toast. */
const SWIPE_DISMISS_THRESHOLD = 72;
/** Drag distance, in pixels, at which the toast reaches full transparency. */
const SWIPE_FADE_DISTANCE = 220;

/** Visual and semantic category used to style and announce a toast. */
export type ToastTone = "success" | "error" | "info";

/** Internal immutable representation of a rendered toast notification. */
type ToastRecord = Readonly<{
  /** Unique identifier used for rendering and dismissal. */
  id: string;
  /** Visual and accessibility tone of the notification. */
  tone: ToastTone;
  /** Primary notification message. */
  title: string;
  /** Optional supporting notification message. */
  description?: string;
}>;

/** Configuration accepted when creating a toast notification. */
type ToastOptions = Readonly<{
  /** Primary notification message. */
  title: string;
  /** Optional supporting notification message. */
  description?: string;
  /** Optional visual and accessibility tone; defaults to `info`. */
  tone?: ToastTone;
  /** Optional display duration in milliseconds. */
  duration?: number;
}>;

/** Imperative toast API returned by {@link useToast}. */
export type ToastApi = Readonly<{
  /** Displays a toast using the supplied configuration and returns its ID. */
  show: (options: ToastOptions) => string;
  /** Displays a success toast and returns its ID. */
  success: (title: string, description?: string) => string;
  /** Displays an error toast and returns its ID. */
  error: (title: string, description?: string) => string;
  /** Displays an informational toast and returns its ID. */
  info: (title: string, description?: string) => string;
  /** Removes a toast immediately by ID. */
  dismiss: (id: string) => void;
}>;

/** React context containing the current toast API, or `null` outside its provider. */
const ToastContext = createContext<ToastApi | null>(null);

/** Maximum number of notifications displayed at one time. */
const MAX_VISIBLE = 3;

/** Default display duration, in milliseconds, for each toast tone. */
const TONE_DURATION: Readonly<Record<ToastTone, number>> = {
  success: 4500,
  info: 5500,
  error: 8000,
};

/** Icon component associated with each toast tone. */
const TONE_ICON = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
} as const;

/**
 * Reads the site-wide toast API.
 *
 * @returns Toast dispatcher with `show`, `success`, `error`, `info`, and `dismiss` helpers.
 * @throws When called outside a {@link ToastProvider}.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return api;
}

/** Renders one toast notification with pointer-swipe and click dismissal. */
function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const Icon = TONE_ICON[toast.tone];
  const dragOriginX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || dismissing) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    dragOriginX.current = event.clientX;
    setSwiping(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragOriginX.current === null) return;
    setDragX(Math.max(0, event.clientX - dragOriginX.current));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragOriginX.current === null) return;
    dragOriginX.current = null;
    setSwiping(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragX >= SWIPE_DISMISS_THRESHOLD) {
      setDismissing(true);
      setDragX(SWIPE_FADE_DISTANCE);
      window.setTimeout(onDismiss, 180);
    } else {
      setDragX(0);
    }
  }

  return (
    <div
      className="toast"
      data-tone={toast.tone}
      data-swiping={swiping || undefined}
      data-dismissing={dismissing || undefined}
      role={toast.tone === "error" ? "alert" : "status"}
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity: dragX ? Math.max(0, 1 - dragX / SWIPE_FADE_DISTANCE) : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Icon size={17} weight="fill" className="toast__icon" />
      <div className="toast__body">
        <strong>{toast.title}</strong>
        {toast.description ? <span>{toast.description}</span> : null}
      </div>
      <button type="button" className="toast__dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <X size={13} />
      </button>
    </div>
  );
}

/**
 * Provides the site-wide toast API and renders the fixed toast viewport.
 *
 * Mounted above the router so a toast raised immediately before a client
 * navigation survives into the destination route.
 *
 * @param props Application subtree that may raise toasts.
 * @returns The subtree wrapped with toast context and an appended viewport.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  /** Removes a toast and cancels its pending automatic dismissal. */
  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  /** Adds a toast, enforces the visible-item limit, and schedules dismissal. */
  const push = useCallback(
    (options: ToastOptions) => {
      const id = String((nextId.current += 1));
      const record: ToastRecord = {
        id,
        tone: options.tone ?? "info",
        title: options.title,
        description: options.description,
      };
      setToasts((current) => {
        const next = [...current, record];
        for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
          const timer = timers.current.get(dropped.id);
          if (timer) {
            clearTimeout(timer);
            timers.current.delete(dropped.id);
          }
        }
        return next.slice(-MAX_VISIBLE);
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.duration ?? TONE_DURATION[record.tone]),
      );
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show: (options) => push(options),
      success: (title, description) => push({ title, description, tone: "success" }),
      error: (title, description) => push({ title, description, tone: "error" }),
      info: (title, description) => push({ title, description, tone: "info" }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
