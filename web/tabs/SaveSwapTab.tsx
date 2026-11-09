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
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (action: Action, accept: boolean) => {
    try {
      const result = await sendJson<{ status: CrossplayStatus }>(action.method, action.path, accept ? { ...action.body, acceptWarnings: true } : action.body);
      setStatus(result.status);
      setPending(null);
      setMessage(action.path.endsWith("handoff") ? (status?.sync ? "Sent. Wait for iCloud to sync, then follow the iPhone steps below." : "Handed off. Use Other ways below to get it to the phone.") : "Done.");
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

  const sync = status.sync;
  const handOff = (): Action => ({ path: "/api/crossplay/handoff", method: "POST", title: "Send to iPhone", body: { expectedSha256: status.pc!.sha256 }, dest: null, source: status.pc });
  const discard = async (i: IncomingSave) => {
    try { setStatus((await sendJson<{ status: CrossplayStatus }>("DELETE", `/api/crossplay/incoming/${encodeURIComponent(i.id)}`)).status); } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <div className="swap">
      <section className="card">
        <h2>{handedOff ? `With Runa since ${time(status.ledger.handoff!.at)}, ${hms(status.ledger.handoff!.meta.playtimeSeconds)} played` : "Your save is on the PC"}</h2>
        {status.gameRunning ? <span className="pill bad" role="status">Game is running. Close it before bringing a save back.</span> : null}
        {pcChanged ? <p className="notice warn">The PC save changed after you sent it to the iPhone. Installing the phone save will replace that PC progress (it stays in a backup).</p> : null}
        {message ? <p className="notice" role="status">{message}</p> : null}
        {error ? <p className="notice warn">{error}</p> : null}
        {status.errors.map((e) => <p key={e} className="notice warn">{e}</p>)}
        <SaveMetaCard meta={status.pc} title="PC save" />
        {!sync ? <p className="notice warn">No iCloud folder found. Set the sync folder in Settings (usually iCloudDrive\Pokemon Reborn Sync), or use Other ways below.</p> : <p className="muted">iCloud folder: {sync.dir}</p>}
      </section>

      <section className="card swap-way">
        <h3>Send to iPhone</h3>
        <ol className="swap-steps">
          <li><b>On the PC:</b> save in the game and close it, then press the button.
            <div className="toolbar">
              {status.pc ? <button disabled={!sync} onClick={() => run(handOff(), false)}>Send to iPhone</button> : null}
              {handedOff ? <button onClick={() => run({ path: "/api/crossplay/reclaim", method: "POST", title: "Take back on PC", body: {}, dest: null, source: null }, false)}>Cancel and keep it on the PC</button> : null}
            </div>
            {!handedOff && status.handOffWarnings.length > 0 ? <ul className="warnings">{status.handOffWarnings.map((w) => <li key={w.code} className="bad">{w.message}</li>)}</ul> : null}
            {sync?.sent ? <p className="muted">Last sent {time(sync.sent.at)}: {sync.sent.trainer}, {hms(sync.sent.playtimeSeconds)} played. Files: {sync.sent.files.join(", ")}.</p> : null}
          </li>
          <li><b>On the iPhone:</b> wait a minute for iCloud, open the <b>Files</b> app, then iCloud Drive, then <b>Pokemon Reborn Sync</b>. Open <b>pokepal_to_runa.zip</b> in <b>Runa</b> (touch and hold, Share, Runa) and choose Import Save.</li>
        </ol>
      </section>

      <section className="card swap-way">
        <h3>Bring back from iPhone</h3>
        <ol className="swap-steps">
          <li><b>On the iPhone:</b> when you are done playing, in Runa choose <b>Export Save</b> and save it to Files, in <b>iCloud Drive, Pokemon Reborn Sync</b>. (The "Reborn to PC" Shortcut does this and names the file <code>reborn_from_phone_…</code>.)</li>
          <li><b>On the PC:</b> it shows up here by itself. Check it, close the game, and press Install on PC.</li>
        </ol>
        {status.incoming.length === 0 ? <p className="muted">Waiting for a save from the iPhone…</p> : null}
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
            {i.meta ? (
              <div className="swap-compare">
                <SaveMetaCard meta={i.meta} title="From iPhone" />
                <SaveMetaCard meta={status.pc} title="On this PC" />
              </div>
            ) : null}
            <ul className="warnings">{i.warnings.map((w) => <li key={w.code} className="bad">{w.message}</li>)}</ul>
            <div className="toolbar">
              <button disabled={!i.meta || status.gameRunning} onClick={() => run(install(i), false)}>Install on PC</button>
              {status.gameRunning ? <small>Close Pokémon Reborn first</small> : null}
              {i.source === "upload" ? <button onClick={() => discard(i)}>Discard</button> : null}
            </div>
          </div>
        ))}
      </section>

      <details className="card swap-other">
        <summary>Other ways (home Wi-Fi)</summary>
        <p className="muted">Only if iCloud is not working. Open PokePal in Safari on the phone while on the same Wi-Fi.</p>
        {status.outbox ? (
          <div>
            <SaveMetaCard meta={status.outbox.meta} title="Ready to download" />
            <a href="/api/crossplay/outbox" download={status.outbox.downloadName}>Download for Runa</a>
          </div>
        ) : <p className="muted">Press Send to iPhone first; then a download link appears here.</p>}
        <div className="toolbar">
          <button onClick={() => fileInput.current?.click()}>Upload Runa save</button>
          <input ref={fileInput} type="file" accept=".zip,.rxdata" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </div>
      </details>

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
        <summary>iCloud tips</summary>
        <ul>
          <li>On the PC, right-click the sync folder in File Explorer and choose Always keep on this device.</li>
          <li>Wait for the cloud icon to turn into a green tick before importing on the iPhone, and for the new file to appear on the PC before checking here.</li>
          <li>PokePal only writes pokepal_to_runa.zip, Game.rxdata and pokepal-handoff.json in that folder. Your exports are never changed or deleted.</li>
        </ul>
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
