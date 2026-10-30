import { access, readdir } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
/** Reuse an installed Microsoft runtime in this process only; never install or
 * modify system DLLs. POSTGRES_RUNTIME_DIR can override the discovered path. */
export async function preparePostgresRuntime() {
  if (process.platform !== "win32") return;
  try { await access("C:/Windows/System32/vcruntime140_1.dll"); return; } catch {}
  const roots = [process.env.POSTGRES_RUNTIME_DIR || ""];
  const edgeRuntime = "C:/Program Files (x86)/Microsoft/EdgeWebView/Application";
  try { for (const entry of (await readdir(edgeRuntime)).filter(n => /^\d+\./.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) roots.push(resolve(edgeRuntime, entry)); } catch {}
  for (const folder of roots.filter(Boolean)) {
    try { await access(resolve(folder, "vcruntime140_1.dll")); process.env.PATH = `${folder}${delimiter}${process.env.PATH || ""}`; return; } catch {}
  }
  throw new Error("The PostgreSQL binary requires the Microsoft Visual C++ x64 runtime. Supply an installed runtime directory using POSTGRES_RUNTIME_DIR.");
}
