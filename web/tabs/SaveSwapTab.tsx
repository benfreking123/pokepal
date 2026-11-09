import { useCallback, useEffect, useRef, useState } from "react";
import type { BackupEntry } from "../../server/crossplay/files";
import type { CrossplayStatus, IncomingSave } from "../../server/crossplay/actions";
import type { SwapWarning } from "../../server/crossplay/lineage";
import type { SaveMeta } from "../../shared/types";
import { getJson, sendJson } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { hms, SaveMetaCard } from "../components/SaveMetaCard";

type Action = { path: string; method: "POST"; body: Record<string, unknown>; title: string; dest: SaveMeta | null; source: SaveMeta | null };
interface Pending { action: Action; warnings: SwapWarning[] }

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export function SaveSwapTab() {
  const [syncEnabled, setSyncEnabled] = useState(false);
  useEffect(() => { getJson<{ config: { syncDir: string | null } }>("/api/config").then((r) => setSyncEnabled(!!r.config.syncDir), () => undefined); }, []);
  const [status, setStatus] = useState<CrossplayStatus | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const qs = Object.keys(entries).length ? `?entries=${encodeURIComponent(JSON.stringify(entries))}` : "";
      setStatus(await getJson<CrossplayStatus>(`/api/crossplay/status${qs}`));
      setBackups(await getJson<BackupEntry[]>("/api/crossplay/backups"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [entries]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (action: Action, accept: boolean) => {
    try {
      const result = await sendJson<{ status: CrossplayStatus }>(action.method, action.path, accept ? { ...action.body, acceptWarnings: true } : action.body);
      setStatus(result.status);
      setPending(null);
      setMessage(action.path.endsWith("handoff") ? "On the iPhone, tap Download for Runa and import it in Runa (Save Management → Import)." : "Done.");
      void refresh();
    } catch (e) {
      const err = e as Error & { status?: number; body?: { code?: string; warnings?: SwapWarning[] } };
      if (err.status === 409 && err.body?.code === "NEEDS_CONFIRMATION") setPending({ action, warnings: err.body.warnings ?? [] });
      else if (err.status === 403) { setPending(null); setMessage("Install and restore only work on the PC running PokePal"); }
      else { setPending(null); setMessage(err.message); }
    }
  };

  const upload = async (file: File) => {
    try {
      const res = await fetch(`/api/crossplay/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
      setStatus(body.status);
      setMessage("Uploaded. Review it below.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (error && !status) return <p className="notice warn" role="alert">{error}</p>;
  if (!status) return <p>Loading…</p>;

  const handedOff = status.ledger.holder === "runa" && status.ledger.handoff;
  const pcChanged = !!handedOff && !!status.pc && status.pc.sha256 !== status.ledger.handoff!.pcSha256;
  const install = (i: IncomingSave): Action => ({
    path: "/api/crossplay/install", method: "POST", title: "Install on PC",
    body: { id: i.id, entry: i.entry, expectedSha256: i.meta!.sha256 }, dest: status.pc, source: i.meta,
  });
  const restore = (b: BackupEntry): Action => ({
    path: "/api/crossplay/restore", method: "POST", title: "Restore backup",
    body: { backupId: b.id, expectedSha256: b.sha256 }, dest: status.pc, source: b.meta,
  });
  const totalBytes = backups.reduce((n, b) => n + b.sizeBytes, 0);

  return (
    <div>
      <section className="card">
        <h2>{handedOff ? `With Runa since ${time(status.ledger.handoff!.at)}, ${hms(status.ledger.handoff!.meta.playtimeSeconds)} played` : "On the PC"}</h2>
        {status.gameRunning ? <span className="pill bad" role="status">Game is running</span> : null}
        {pcChanged ? <p className="notice warn">The PC save changed after the hand-off to Runa. Installing a Runa save will replace that PC progress (it stays in a backup).</p> : null}
        {message ? <p className="notice" role="status">{message}</p> : null}
        {error ? <p className="notice warn">{error}</p> : null}
        {status.errors.map((e) => <p key={e} className="notice warn">{e}</p>)}
        <SaveMetaCard meta={status.pc} title="PC save" />
        <div className="toolbar">
          {!handedOff && status.pc ? (
            <button onClick={() => run({ path: "/api/crossplay/handoff", method: "POST", title: "Hand off to Runa", body: { expectedSha256: status.pc!.sha256 }, dest: null, source: status.pc }, false)}>Hand off to Runa</button>
          ) : null}
          {handedOff ? <button onClick={() => run({ path: "/api/crossplay/reclaim", method: "POST", title: "Take back on PC", body: {}, dest: null, source: null }, false)}>Take back on PC</button> : null}
          <button onClick={() => fileInput.current?.click()}>Upload Runa save</button>
          <input ref={fileInput} type="file" accept=".zip,.rxdata" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </div>
        {!handedOff && status.handOffWarnings.length > 0 ? <ul className="warnings">{status.handOffWarnings.map((w) => <li key={w.code} className="bad">{w.message}</li>)}</ul> : null}
      </section>

      {status.outbox ? (
        <section className="card">
          <h3>Outbox</h3>
          <SaveMetaCard meta={status.outbox.meta} />
          <a href="/api/crossplay/outbox" download={status.outbox.downloadName}>Download for Runa</a>
        </section>
      ) : null}

      <section className="card">
        <h3>Incoming</h3>
        {status.incoming.length === 0 ? <p>Nothing uploaded yet. Export from Runa, then tap Upload Runa save.</p> : null}
        {status.incoming.map((i) => (
          <div key={i.id} className="card">
            <b>{i.fileName}</b> <span className="muted">({i.source === "icloud" ? "iCloud folder" : "upload"})</span>
            {i.entries && i.entries.length > 1 ? (
              <select value={entries[i.id] ?? ""} onChange={(e) => setEntries({ ...entries, [i.id]: e.target.value })} aria-label="Save in export">
                <option value="">Pick a save…</option>
                {i.entries.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : null}
            {i.error ? <p className="notice warn">{i.error}</p> : null}
            {i.meta ? <SaveMetaCard meta={i.meta} /> : null}
            <ul className="warnings">{i.warnings.map((w) => <li key={w.code} className="bad">{w.message}</li>)}</ul>
            <div className="toolbar">
              <button disabled={!i.meta || status.gameRunning} onClick={() => run(install(i), false)}>Install on PC</button>
              {status.gameRunning ? <small>Close Pokémon Reborn first</small> : null}
              {i.source === "upload" ? (
                <button onClick={async () => {
                  try { setStatus((await sendJson<{ status: CrossplayStatus }>("DELETE", `/api/crossplay/incoming/${encodeURIComponent(i.id)}`)).status); } catch (e) { setMessage((e as Error).message); }
                }}>Discard</button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <details className="card">
        <summary>Backups ({backups.length}, {kb(totalBytes)})</summary>
        <ul>
          {backups.map((b) => (
            <li key={b.id}>
              {new Date(b.createdAt).toLocaleString()} · {b.reason} · {b.meta ? `${hms(b.meta.playtimeSeconds)} played` : "unreadable"} · {kb(b.sizeBytes)}{" "}
              <button disabled={status.gameRunning} onClick={() => run(restore(b), false)}>Restore</button>
            </li>
          ))}
        </ul>
      </details>

      <details className="card">
        <summary>How it works</summary>
        <ol>
          <li>On the PC, save in game and close it. Tap Hand off to Runa (a backup is made first).</li>
          <li>On the iPhone, tap Download for Runa, then import it in Runa (Save Management → Import).</li>
          <li>Play in Runa, then export the save from Runa and tap Upload Runa save here.</li>
          <li>On the PC, review the warnings and tap Install on PC. The old PC save is backed up first.</li>
        </ol>
        {syncEnabled ? (
          <>
            <h4>iCloud tips</h4>
            <ul>
              <li>Right-click the sync folder in File Explorer and choose Always keep on this device.</li>
              <li>Wait for the cloud icon to turn into a green tick before importing on the iPhone.</li>
            </ul>
          </>
        ) : null}
      </details>

      {pending ? (
        <ConfirmDialog
          title={pending.action.title}
          warnings={pending.warnings}
          cards={<><SaveMetaCard meta={pending.action.source} title="From" /><SaveMetaCard meta={pending.action.dest} title="Replaces" /></>}
          onConfirm={() => run(pending.action, true)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}
