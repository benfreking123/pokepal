import { useState, type RefObject } from "react";

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

export function CopyButton({ text, textareaRef }: { text: string; textareaRef?: RefObject<HTMLTextAreaElement | null> }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const click = async () => {
    const ok = await copyText(text);
    if (!ok) textareaRef?.current?.select();
    setState(ok ? "copied" : "failed");
    if (ok) setTimeout(() => setState("idle"), 2000);
  };
  return (
    <>
      <button onClick={click}>{state === "copied" ? "Copied" : "Copy"}</button>
      {state === "failed" ? <span role="status"> Select the text and copy manually</span> : null}
    </>
  );
}
