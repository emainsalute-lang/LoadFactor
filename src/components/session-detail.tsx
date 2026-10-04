import { heightFromCm, parseDate, weightFromKg, sessionTrainingLoad } from "@/lib/analytics";
import { sprintSegments, testIdentity } from "@/lib/tests-analysis";
import { sessionCatalog, sessionTotals } from "@/lib/history";
import type { HeightUnit, WeightUnit, WorkoutSession } from "@/lib/types";
import SessionFeedback from "./session-feedback";
export default function SessionDetail({ session, weightUnit, heightUnit, feedbackRole = "athlete", feedbackEnabled = true }: { session: WorkoutSession; weightUnit: WeightUnit; heightUnit: HeightUnit; feedbackRole?: "athlete" | "coach"; feedbackEnabled?: boolean }) {
  const totals = sessionTotals(session), catalog = sessionCatalog(session);
  return <article className="session-detail">
    <h2>{session.title}</h2><p className="account-description">{parseDate(session.date).toLocaleDateString("en-US", { dateStyle: "long" })}</p>
    {session.plannedWorkoutId && <p className="account-description">Linked to a scheduled workout. View the schedule for target comparison.</p>}
    <div className="tag-list">{(session.tags ?? []).map(tag => <span className="session-tag" key={tag}>{tag}</span>)}</div>
    <dl className="history-stats"><div><dt>Sets</dt><dd>{totals.sets}</dd></div><div><dt>Volume ({weightUnit})</dt><dd>{weightFromKg(totals.volumeKg, weightUnit).toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd></div><div><dt>Mean set RPE</dt><dd>{totals.averageRpe?.toFixed(1) ?? "-"}</dd></div></dl>
    <p className="account-description">Recorded bodyweight: {session.bodyweightKg ? weightFromKg(session.bodyweightKg, weightUnit).toFixed(1) + " " + weightUnit : "not recorded"}</p>
    <dl className="history-stats"><div><dt>Duration (minutes)</dt><dd>{session.durationMinutes ?? "Not recorded"}</dd></div><div><dt>Overall session RPE</dt><dd>{session.sessionRpe ?? "Not recorded"}</dd></div><div><dt>Session load (AU)</dt><dd>{sessionTrainingLoad(session)?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "Not recorded"}</dd></div></dl>
    <h3>Session notes</h3><p className="session-notes">{session.notes || "No notes recorded."}</p>
    <div className="table-scroll"><table><caption className="sr-only">All sets in {session.title}</caption><thead><tr><th>Exercise</th><th>Set</th><th>Type / groups</th><th>Tempo / pause</th><th>Load ({weightUnit})</th><th>Reps</th><th>Jump ({heightUnit})</th><th>Split (s)</th><th>RPE</th><th>Technique video</th></tr></thead><tbody>{session.exercises.map(set => <tr key={set.id}><td>{catalog.find(e => e.id === set.exerciseId)?.name ?? set.exerciseId}</td><td>{set.setNumber}</td><td>{set.setType ?? "working"}{set.superset ? " | Superset " + set.superset : ""}{set.dropGroup ? " | " + set.dropGroup : ""}</td><td>{set.tempo ?? "-"}{set.pauseSeconds === null || set.pauseSeconds === undefined ? "" : " | " + set.pauseSeconds + "s pause"}</td><td>{weightFromKg(set.weightKg, weightUnit).toFixed(1)}</td><td>{set.reps}</td><td>{set.jumpHeightCm === null ? "-" : heightFromCm(set.jumpHeightCm, heightUnit).toFixed(1)}</td><td>{set.splitTimeSeconds?.toFixed(3) ?? "-"}</td><td>{set.rpe}</td><td>{set.videoUrl ? <a href={set.videoUrl} target="_blank" rel="noopener noreferrer">Open video</a> : "-"}</td></tr>)}</tbody></table></div>
    <h3>Jump and sprint protocols</h3>{session.exercises.filter(set => catalog.find(e => e.id === set.exerciseId)?.kind !== "strength").map(set => {
      const kind = catalog.find(e => e.id === set.exerciseId)?.kind ?? "jump", identity = testIdentity(set, kind);
      return <div key={set.id} className="session-notes"><strong>{catalog.find(e => e.id === set.exerciseId)?.name} / attempt {set.setNumber}</strong><p>{identity.variant}{set.test?.broadJumpCm ? " / " + heightFromCm(set.test.broadJumpCm, heightUnit).toFixed(1) + " " + heightUnit : ""}</p><p>{identity.protocol}</p>{kind === "sprint" && <p>Mean speed: {identity.distanceM && set.splitTimeSeconds ? (identity.distanceM / set.splitTimeSeconds).toFixed(2) + " m/s" : "distance not recorded"}. {sprintSegments(set).map(p => p.fromM + "-" + p.toM + " m: " + p.seconds.toFixed(3) + " s / " + p.speedMps.toFixed(2) + " m/s").join("; ")}</p>}</div>;
    })}
    {feedbackEnabled && session.userId !== "athlete-demo" && <SessionFeedback athleteId={session.userId} sessionId={session.id} role={feedbackRole}/>}
  </article>;
}
