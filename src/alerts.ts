import { CandidateEvent, CodexAnalysisResult, Severity } from "./types";
import { saveAlert } from "./storage";
import { nowIso, severityGte } from "./utils";

export async function maybeSaveAlert(options: {
  dataDir: string;
  minSeverity: Severity;
  emailEnabled: boolean;
  candidate: CandidateEvent;
  analysis: CodexAnalysisResult;
}): Promise<string | null> {
  if (!options.analysis.should_email || !severityGte(options.analysis.severity, options.minSeverity)) {
    return null;
  }
  return saveAlert(options.dataDir, options.candidate.event.eventId, {
    kind: "LOCAL_RISK_ALERT",
    createdAt: nowIso(),
    emailSending: options.emailEnabled ? "pending_mailer" : "disabled",
    candidate: options.candidate,
    analysis: options.analysis
  });
}
