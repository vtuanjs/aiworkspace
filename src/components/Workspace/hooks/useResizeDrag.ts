import type React from "react";

export function startResizeDrag(
  e: React.MouseEvent,
  startValue: number,
  axis: "x" | "y",
  invert: boolean,
  min: number,
  max: number,
  onResize: (value: number) => void
): void {
  e.preventDefault();
  const startPos = axis === "x" ? e.clientX : e.clientY;
  const onMove = (ev: MouseEvent) => {
    const pos = axis === "x" ? ev.clientX : ev.clientY;
    const delta = invert ? startPos - pos : pos - startPos;
    onResize(Math.max(min, Math.min(max, startValue + delta)));
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
