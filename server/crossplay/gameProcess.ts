import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

export interface ProcessEntry { name: string; exePath: string | null }

export function parseProcessList(stdout: string): ProcessEntry[] {
  return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, exePath = ""] = line.split("|");
    return { name, exePath: exePath || null };
  });
}

// Every mkxp-z game ships as Game.exe, so a known gameDir narrows the match. A process whose path
// Windows won't reveal still counts as running: blocking an install is the safe mistake.
export function gameIsRunning(procs: ProcessEntry[], names: string[], gameDir: string | null): boolean {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const dir = gameDir ? path.win32.resolve(gameDir).toLowerCase() + "\\" : null;
  return procs.some((p) => wanted.has(p.name.toLowerCase()) && (!dir || !p.exePath || p.exePath.toLowerCase().startsWith(dir)));
}

export async function isGameRunning(names: string[], gameDir: string | null): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const filter = names.map((n) => `Name='${n.replace(/'/g, "''")}'`).join(" OR ");
  const script = `Get-CimInstance Win32_Process -Filter "${filter}" | ForEach-Object { "$($_.Name)|$($_.ExecutablePath)" }`;
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10_000 });
  return gameIsRunning(parseProcessList(stdout), names, gameDir);
}
