import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Minimal drawn-signature pad. Emits a PNG data URL, or "" when cleared. */
export function SignaturePad({ onChange, invalid }: { onChange: (dataUrl: string) => void; invalid?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b3d2e";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        className={`h-36 w-full touch-none rounded-md border bg-white ${invalid ? "border-destructive" : "border-input"}`}
        aria-label="Signature drawing area"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current!.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (dirty.current) onChange(canvas.current!.toDataURL("image/png"));
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const c = canvas.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          dirty.current = false;
          onChange("");
        }}
      >
        Clear signature
      </Button>
    </div>
  );
}
