import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pointer-based dragging that works the same with a mouse, a finger or a pen.
 *
 * Pointer Events give us one code path for all three, and setPointerCapture
 * keeps the drag alive even when the pointer leaves the element. The handle
 * carries `touch-action: none` so a finger drags the panel rather than
 * scrolling the page underneath it.
 *
 * The position is stored as a top-left offset in viewport coordinates, clamped
 * so the element can never be dragged out of reach, and persisted per key so it
 * survives a reload. `null` means "wherever CSS puts it" — the default corner.
 */
export function useDraggable({ storageKey, margin = 8, enabled = true }) {
  const elRef = useRef(null);
  const [pos, setPos] = useState(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  const movedRef = useRef(false);

  const clamp = useCallback((p, el) => {
    const w = el?.offsetWidth || 0;
    const h = el?.offsetHeight || 0;
    // Keep at least a corner grabbable, never let it leave the viewport.
    const maxX = Math.max(margin, window.innerWidth - w - margin);
    const maxY = Math.max(margin, window.innerHeight - h - margin);
    return {
      x: Math.min(Math.max(margin, p.x), maxX),
      y: Math.min(Math.max(margin, p.y), maxY),
    };
  }, [margin]);

  const onPointerDown = useCallback((e) => {
    if (!enabled) return;
    // Ignore drags that start on a control inside the handle.
    if (e.target.closest('button, a, select, input, textarea')) return;
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    startRef.current = { px: e.clientX, py: e.clientY, ox: r.left, oy: r.top };
    movedRef.current = false;
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
  }, [enabled]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !startRef.current) return;
    const { px, py, ox, oy } = startRef.current;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    setPos(clamp({ x: ox + dx, y: oy + dy }, elRef.current));
  }, [dragging, clamp]);

  const endDrag = useCallback((e) => {
    if (!dragging) return;
    setDragging(false);
    startRef.current = null;
    try { e?.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* fine */ }
    setPos((p) => {
      if (p && storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* quota */ }
      }
      return p;
    });
  }, [dragging, storageKey]);

  /** Snap back to the CSS default corner. */
  const reset = useCallback(() => {
    setPos(null);
    if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* fine */ } }
  }, [storageKey]);

  // Re-clamp when the viewport changes, so rotating a phone or resizing a
  // window never strands the panel off-screen.
  useEffect(() => {
    if (!pos) return undefined;
    const onResize = () => setPos((p) => (p ? clamp(p, elRef.current) : p));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [pos, clamp]);

  // Clamp once on mount too — the stored position may not fit this screen.
  useEffect(() => {
    if (!pos || !elRef.current) return;
    const c = clamp(pos, elRef.current);
    if (c.x !== pos.x || c.y !== pos.y) setPos(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : undefined;

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  return { elRef, style, dragging, handleProps, reset, moved: () => movedRef.current, isPlaced: !!pos };
}
