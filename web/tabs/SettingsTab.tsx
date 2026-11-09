import { useEffect, useState } from "react";
import type { SPOILER_SWITCHES } from "../../shared/spoilers";
import type { ClientBundle, SpoilerSettings } from "../../shared/types";
import { getJson, sendJson } from "../api";

interface ConfigResponse {
  config: Record<string, unknown> & { port: number; lanAccess: boolean };
  exists: Record<string, boolean>;
  saveCandidates: { path: string; exists: boolean }[];
  lanUrls: string[];
}
interface SpoilerResponse {
  settings: SpoilerSettings;
  foundFieldNotes: string[];
  seenTrainerCount: number;
  switches: typeof SPOILER_SWITCHES;
  error: string | null;
}

const PATH_FIELDS = ["gameDir", "saveFile", "syncDir", "stateDir", "backupDir", "battleStateFile"] as const;

function GeneralSettings({ bundle }: { bundle: ClientBundle }) {
  const [info, setInfo] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<ConfigResponse["config"] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getJson<ConfigResponse>("/api/config").then((r) => { setInfo(r); setDraft(r.config); }, (e: Error) => setMessage(e.message));
  }, []);

  if (!info || !draft) return <section className="card"><h2>General</h2><p>{message ?? "Loading…"}</p></section>;

  const save = async () => {
    try {
      await sendJson("PUT", "/api/config", draft);
      setMessage("Restart PokePal to apply");
    } catch (e) {
      setMessage((e as { status?: number }).status === 403 ? "Settings can only be changed on the PC" : (e as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>General</h2>
      <p>Data version: {bundle.meta.gameVersion}</p>
      {PATH_FIELDS.map((k) => (
        <label key={k} className="settings-row">
          <span>{k} <b className={info.exists[k] ? "ok" : "bad"}>{info.exists[k] ? "found" : "not found"}</b></span>
          <input value={(draft[k] as string | null) ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value || null })} />
        </label>
      ))}
      <label className="settings-row">
        <span>port</span>
        <input type="number" value={draft.port} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })} />
      </label>
      <label className="settings-row">
        <span>Allow phone access (LAN)</span>
        <input type="checkbox" checked={draft.lanAccess} onChange={(e) => setDraft({ ...draft, lanAccess: e.target.checked })} />
      </label>
      <h3>Save file locations checked</h3>
      <ul>{info.saveCandidates.map((c) => (<li key={c.path}>{c.path} <b className={c.exists ? "ok" : "bad"}>{c.exists ? "found" : "not found"}</b></li>))}</ul>
      <h3>Phone URLs</h3>
      <ul>{info.lanUrls.length ? info.lanUrls.map((u) => <li key={u}>{u}</li>) : <li>No LAN address found</li>}</ul>
      <button onClick={save}>Save</button> {message ? <span role="status">{message}</span> : null}
    </section>
  );
}

function SpoilerSettingsSection({ bundle, onChange }: { bundle: ClientBundle; onChange: () => void }) {
  const [state, setState] = useState<SpoilerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromSave, setFromSave] = useState<string[]>([]);

  useEffect(() => {
    getJson<{ fieldNotesFound: string[] | null }>("/api/save/summary").then((s) => setFromSave(s.fieldNotesFound ?? []), () => undefined);
    getJson<SpoilerResponse>("/api/spoilers").then(setState, (e: Error) => setError(e.message));
  }, []);

  const update = async (payload: unknown) => {
    try {
      setState(await sendJson<SpoilerResponse>("PUT", "/api/spoilers", payload));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!state) return <section className="card" id="settings-spoilers"><h2>Spoilers</h2><p>{error ?? "Loading…"}</p></section>;

  return (
    <section className="card" id="settings-spoilers">
      <h2>Spoilers</h2>
      {state.error ? <p className="notice warn">{state.error} The defaults are in use until a change is saved.</p> : null}
      {error ? <p className="notice warn">{error}</p> : null}
      {state.switches.map((s) => (
        <div key={s.key} className="switch-row">
          <label>
            <input type="checkbox" role="switch" checked={state.settings[s.key]} onChange={(e) => update({ settings: { [s.key]: e.target.checked } })} /> {s.label}
          </label>
          <small>{s.reveals}</small>
        </div>
      ))}
      {!state.settings.fieldDetails ? (
        <>
          <h3>Field Notes found</h3>
          <div className="field-notes">
            {Object.values(bundle.fields).sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={fromSave.includes(f.id) || state.foundFieldNotes.includes(f.id)}
                  disabled={fromSave.includes(f.id)}
                  onChange={(e) => update({ foundFieldNotes: e.target.checked ? [...state.foundFieldNotes, f.id] : state.foundFieldNotes.filter((x) => x !== f.id) })}
                />{" "}
                {f.name}{fromSave.includes(f.id) ? <small> (from your save)</small> : null}
              </label>
            ))}
          </div>
        </>
      ) : null}
      <h3>Seen Pokémon</h3>
      <p>Seen Pokémon recorded for {state.seenTrainerCount} trainers.</p>
      <button onClick={() => { if (confirm("Forget every recorded seen Pokémon?")) update({ clearSeen: true }); }}>Forget seen Pokémon</button>
    </section>
  );
}

export function SettingsTab({ bundle, onChange }: { bundle: ClientBundle; onChange: () => void }) {
  useEffect(() => {
    if (location.hash === "#settings-spoilers") document.getElementById("settings-spoilers")?.scrollIntoView();
  }, []);
  return (
    <div>
      <SpoilerSettingsSection bundle={bundle} onChange={onChange} />
      <GeneralSettings bundle={bundle} />
    </div>
  );
}
