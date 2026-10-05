"use client";
import { useState } from "react";
import { exportSessionsCsv, previewSessionsCsv, type CsvPreviewRow } from "@/lib/session-csv";
import type { SessionInput } from "@/lib/validation";
import type { WorkoutSession } from "@/lib/types";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export default function SessionCsvTools({ sessions, today, onImport }: { sessions: WorkoutSession[]; today: string; onImport: (session: SessionInput) => Promise<void> }) {
  const [preview, setPreview] = useState<CsvPreviewRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function readFile(file?: File) {
    setError(""); setNotice(""); setPreview([]);
    if (!file) return;
    try { setPreview(previewSessionsCsv(await file.text(), today)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read this CSV."); }
  }
  async function importRows() {
    const valid = preview.filter((row): row is CsvPreviewRow & { session: SessionInput } => !!row.session);
    if (!valid.length) return;
    setBusy(true); setError(""); let imported = 0;
    try {
      for (const row of valid) { await onImport(row.session); imported++; }
      setNotice(`Imported ${imported} session(s). Invalid preview rows were skipped.`);
      setPreview([]);
    } catch (e) { setError((e instanceof Error ? e.message : "Import failed.") + ` ${imported} earlier row(s) were imported.`); }
    finally { setBusy(false); }
  }
  return <section className="panel p-5 mt-5" aria-label="CSV import and export">
    <div className="section-title"><div><span className="eyebrow">Import and export</span><h2>CSV session import & export</h2></div><button type="button" className="secondary-button" onClick={() => download("loadfactor-sessions.csv", exportSessionsCsv(sessions))}>Export CSV</button></div>
    <p className="account-description">Import a LoadFactor CSV and inspect every row before saving. Session JSON is validated against the same exercise, measurement, and date rules as the logger. Rows with errors are skipped.</p>
    <label className="field-label">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])}/></label>
    {preview.length > 0 && <><p>{preview.filter(row => row.session).length} valid / {preview.filter(row => row.error).length} invalid rows</p><div className="table-scroll"><table><thead><tr><th>CSV row</th><th>Session</th><th>Validation</th></tr></thead><tbody>{preview.map(row => <tr key={row.line}><td>{row.line}</td><td>{row.title}</td><td>{row.error ?? "Ready to import"}</td></tr>)}</tbody></table></div><button type="button" className="primary-button" disabled={busy || !preview.some(row => row.session)} onClick={() => void importRows()}>{busy ? "Importing…" : "Import valid sessions"}</button></>}
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
  </section>;
}
