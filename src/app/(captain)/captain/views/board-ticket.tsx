"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestSync } from "@/lib/offline/store";
import { useOnline } from "../parts";

// BarcodeDetector is in Chrome on Android (the captains' phones); elsewhere the code is typed.
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
const BarcodeDetectorCtor = () =>
  (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;

/** Board a passenger by ticket code (typed or scanned). Needs a connection to check the ticket. */
export function BoardTicket() {
  const t = useTranslations("board");
  const te = useTranslations("errors");
  const online = useOnline();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  async function board(value: string) {
    const res = await fetch("/api/v1/tickets/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: value.trim().toUpperCase() }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as {
      name?: string;
      seats?: number;
      error?: { code: string };
    } | null;
    if (res?.ok && body?.name) {
      setMessage({ ok: true, text: t("boarded", { name: body.name, seats: body.seats ?? 1 }) });
      setCode("");
      void requestSync();
    } else {
      const c = body?.error?.code ?? "unknown";
      setMessage({ ok: false, text: te.has(c) ? te(c as "unknown") : te("unknown") });
    }
  }

  useEffect(() => {
    if (!scanning) return;
    const Ctor = BarcodeDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let stop = false;
    void (async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).catch(() => null);
      if (!stream || !video.current) return setScanning(false);
      video.current.srcObject = stream;
      await video.current.play();
      while (!stop) {
        const found = await detector.detect(video.current).catch(() => []);
        if (found[0]?.rawValue) {
          setScanning(false);
          await board(found[0].rawValue);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // board is stable enough for a scan session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  if (!online) return <p className="text-sm text-body">{t("needsSignal")}</p>;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-hairline p-4" aria-label={t("title")}>
      <span className="label-mono-sm text-meta">{t("title")}</span>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void board(code);
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label={t("code")}
          placeholder={t("code")}
          maxLength={8}
          autoCapitalize="characters"
          className="h-14 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-surface-sunken px-4 font-mono text-lg text-foreground uppercase"
        />
        <button type="submit" className="h-14 rounded-sm border border-hairline-strong px-4 label-mono text-foreground">
          {t("board")}
        </button>
      </form>
      {BarcodeDetectorCtor() && (
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          className="h-12 rounded-sm border border-hairline-strong label-mono text-foreground"
        >
          {scanning ? t("stopScan") : t("scan")}
        </button>
      )}
      {scanning && <video ref={video} muted playsInline className="w-full rounded-sm" />}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-foreground" : "text-sm text-danger"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
