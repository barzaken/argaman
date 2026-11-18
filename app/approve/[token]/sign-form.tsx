"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { signApproval } from "./actions";

export function SignForm({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-lg font-semibold">תודה, האישור התקבל.</p>
        <p className="text-sm">נמשיך בהכנת המצבה וניצור קשר לתיאום.</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!hasInk) {
          setError("נא לחתום במסגרת");
          return;
        }
        setPending(true);
        const png = canvasRef.current!.toDataURL("image/png");
        const res = await signApproval({ token, signerName: name, signaturePng: png, note, confirmed }).catch(() => ({
          ok: false as const,
          message: "אין חיבור. נסו שוב.",
        }));
        setPending(false);
        if (!res.ok) setError(res.message);
        else setDone(true);
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">שם מלא של החותם/ת</span>
        <Input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">חתימה</span>
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-gray-300 bg-white"
          aria-label="מסגרת חתימה"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            setHasInk(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerLeave={() => {
            drawing.current = false;
          }}
        />
        <button type="button" onClick={clear} className="self-start text-sm text-gray-600 underline underline-offset-4">
          ניקוי חתימה
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">הערה (לא חובה)</span>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>קראתי את הנוסח ובדקתי את ההדמיה. אני מאשר/ת אותם לחריטה, כולל איות השמות והתאריכים.</span>
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} size="default">
        {pending ? "שולח…" : "אישור וחתימה"}
      </Button>
    </form>
  );
}
