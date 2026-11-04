"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string; tools?: string[] };

/** Streams the assistant's answer as it is written; shows which records it looked at. */
export function AssistantChat({ orgId }: { orgId: string }) {
  const t = useTranslations("assistant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  async function ask(question: string) {
    const history: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setBusy(true);
    const update = (fn: (m: Message) => Message) =>
      setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);
    try {
      const res = await fetch("/api/v1/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_id: orgId, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error("failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as { type: string; text?: string; name?: string };
          if (e.type === "text") update((m) => ({ ...m, content: m.content + (e.text ?? "") }));
          if (e.type === "tool") update((m) => ({ ...m, tools: [...(m.tools ?? []), e.name ?? ""] }));
          if (e.type === "error") update((m) => ({ ...m, content: t("error") }));
        }
      }
    } catch {
      update((m) => ({ ...m, content: t("error") }));
    }
    setBusy(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = input.current?.value.trim();
    if (!q || busy) return;
    input.current!.value = "";
    void ask(q);
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3" aria-live="polite" data-testid="assistant-messages">
        {messages.length === 0 && (
          <li className="flex flex-wrap gap-2">
            {(["expiring", "takings", "idle"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => ask(t(`examples.${k}`))}
                className="rounded-sm border border-hairline-strong px-3 py-2 text-sm text-body hover:text-foreground"
              >
                {t(`examples.${k}`)}
              </button>
            ))}
          </li>
        )}
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-md bg-surface-raised px-4 py-2 text-foreground"
                : "flex flex-col gap-1"
            }
            data-role={m.role}
          >
            {m.role === "assistant" && !!m.tools?.length && (
              <span className="label-mono-sm text-meta">
                {t("checked", {
                  tools: m.tools
                    .map((x) => (t.has(`tools.${x}`) ? t(`tools.${x}` as "tools.get_daily_report") : x))
                    .join(", "),
                })}
              </span>
            )}
            <span className="whitespace-pre-wrap text-foreground">
              {m.content || (busy && i === messages.length - 1 ? t("thinking") : "")}
            </span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          ref={input}
          aria-label={t("ask")}
          placeholder={t("placeholder")}
          rows={2}
          maxLength={4000}
          className="rounded-sm border border-hairline-strong bg-surface-sunken p-3 text-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <Button type="submit" disabled={busy} className="w-fit">
          {t("ask")}
        </Button>
        <p className="text-xs text-meta">{t("limits")}</p>
      </form>
    </div>
  );
}
