"use client";

import { useState } from "react";
import { Clock, Edit3, Loader2, Send, X } from "lucide-react";
import { motion } from "framer-motion";

interface EmailDraft {
  email: string;
  name: string;
  subject: string;
  body: string;
}

interface PipelineStatusForApproval {
  campaign: {
    id: string;
    status: string;
    subjectTemplate: string;
    bodyTemplate: string;
    emailsJson: EmailDraft[];
  } | null;
}

interface ApprovalCheckpointProps {
  data: PipelineStatusForApproval;
  onApprove: (subject: string, body: string) => void;
  onCancel: () => void;
}

export default function ApprovalCheckpoint({ data, onApprove, onCancel }: ApprovalCheckpointProps) {
  const [subjectTemplate, setSubjectTemplate] = useState(data.campaign?.subjectTemplate ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(data.campaign?.bodyTemplate ?? "");
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const emails = data.campaign?.emailsJson ?? [];
  const preview = emails[previewIdx];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--brand-surface)] border border-[var(--brand-primary)] rounded-lg shadow-2xl"
      >
        <div className="px-8 py-6 border-b border-[var(--brand-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-[var(--brand-warning)]" />
              <h2 className="text-2xl font-bold tracking-tight text-[var(--brand-text)] uppercase text-editorial">
                Authorization Required
              </h2>
            </div>
            <button
              onClick={onCancel}
              className="text-[var(--brand-muted)] hover:text-[var(--brand-text)] transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[var(--brand-muted)] font-mono text-sm uppercase">
            Payload ready for deployment. Manual sign-off required.
          </p>
        </div>

        {preview && (
          <div className="px-8 py-6 border-b border-[var(--brand-border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-editorial uppercase tracking-wider text-sm text-[var(--brand-text)]">
                Payload Inspection
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[var(--brand-surface-2)] text-[var(--brand-text)] hover:text-[var(--brand-primary)] uppercase tracking-wide font-medium transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> {editing ? "Preview" : "Edit Config"}
                </button>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono mb-2 text-[var(--brand-muted)] uppercase">
                    Subject Parameter
                  </label>
                  <input
                    type="text"
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    className="input-standard font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono mb-2 text-[var(--brand-muted)] uppercase">
                    Body Parameter
                  </label>
                  <textarea
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    rows={8}
                    className="input-standard font-mono resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded border border-[var(--brand-border)] bg-[#000] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
                  <div className="flex gap-4 text-sm font-mono">
                    <span className="text-[var(--brand-muted)] uppercase">Target:</span>
                    <span className="text-[var(--brand-primary)]">
                      {preview.name} &lt;{preview.email}&gt;
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm mt-1 font-mono">
                    <span className="text-[var(--brand-muted)] uppercase">Subject:</span>
                    <span className="text-[var(--brand-text)]">{preview.subject}</span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-[var(--brand-muted)] leading-relaxed">
                    {preview.body}
                  </pre>
                </div>
              </div>
            )}

            {!editing && emails.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {emails.slice(0, 10).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewIdx(i)}
                    className={`w-8 h-8 flex-shrink-0 rounded flex items-center justify-center font-mono text-xs transition-colors ${
                      previewIdx === i
                        ? "bg-[var(--brand-primary)] text-black"
                        : "bg-[var(--brand-surface-2)] text-[var(--brand-muted)] hover:text-white"
                    }`}
                  >
                    0{i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-8 py-6 flex gap-4 bg-[var(--brand-bg)]">
          <button
            onClick={onCancel}
            className="btn-ghost flex-1 py-3 uppercase tracking-widest text-xs font-bold"
          >
            Abort
          </button>
          <button
            onClick={async () => {
              setApproving(true);
              await onApprove(subjectTemplate, bodyTemplate);
              setApproving(false);
            }}
            disabled={approving}
            className="btn-primary flex-1 py-3 uppercase tracking-widest text-xs font-bold"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Send className="w-4 h-4" /> Authorize Launch ({emails.length})</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
