"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload, FileCheck2 } from "lucide-react";
import { uploadDocument } from "@/app/actions/workflow";
import { Drawer, Field } from "./forms";
import { useToast } from "./toast";

/**
 * Upload or replace the FDR receipt. The server checks the type from the file's bytes and the size limit.
 * The "values on the document" are typed by the uploader and stay UNVERIFIED (no OCR in this prototype);
 * the alert engine compares them with the register to flag mismatches.
 */
export function UploadDocument({ fdrId, hasExisting, maxMb }: { fdrId: string; hasExisting: boolean; maxMb: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErrors({ file: "Choose a PDF, JPEG or PNG" }); return; }
    if (file.size > maxMb * 1024 * 1024) { setErrors({ file: `Larger than ${maxMb} MB` }); return; }
    const fd = new FormData(formRef.current!);
    fd.set("fdr_id", fdrId);
    start(async () => {
      const r = await uploadDocument(fd);
      if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast({ title: "Upload failed", description: r.error, tone: "error" }); return; }
      setOpen(false);
      setFile(null);
      toast({ title: hasExisting ? "New version uploaded" : "Document uploaded", description: "Sent to the verification queue. Uploading does not mean verified." });
      router.refresh();
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Upload size={15} /> {hasExisting ? "Upload new version" : "Upload FDR receipt"}</button>
      <Drawer open={open} onClose={() => setOpen(false)} dirty={!!file} title={hasExisting ? "Replace FDR receipt" : "Upload FDR receipt"}
        description={`PDF, JPEG or PNG up to ${maxMb} MB. Stored privately; viewed only through short-lived signed links.`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="upload-form" disabled={pending}>{pending ? "Uploading…" : "Upload and send for review"}</button>
        </>}>
        <form id="upload-form" ref={formRef} onSubmit={submit} noValidate className="space-y-5">
          <input type="hidden" name="doc_type" value="fdr_receipt" />
          <Field label="File" htmlFor="file" error={errors.file}>
            <label htmlFor="file" className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center cursor-pointer transition-colors
              ${file ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line-strong)] hover:border-[var(--ink-3)] bg-[var(--surface-2)]"}`}>
              {file ? <FileCheck2 size={22} className="text-[var(--accent)]" /> : <Upload size={22} className="text-ink-3" />}
              <span className="text-[0.86rem] font-medium">{file ? file.name : "Choose a file"}</span>
              <span className="text-[0.74rem] text-ink-3">{file ? `${(file.size / 1024).toFixed(0)} KB` : "or drop it here"}</span>
            </label>
            <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors({}); }} />
          </Field>
          <fieldset className="space-y-3">
            <legend className="text-[0.86rem] font-semibold">Values printed on the document</legend>
            <p className="text-[0.76rem] text-ink-3 -mt-1">Optional, typed by you, and treated as unverified. A mismatch with the register raises an alert for the verifier.</p>
            <Field label="FDR number on document" htmlFor="declared_fdr_number"><input id="declared_fdr_number" name="declared_fdr_number" className="input mono" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount on document" htmlFor="declared_amount" error={errors.declared_amount}><input id="declared_amount" name="declared_amount" inputMode="decimal" className="input mono" /></Field>
              <Field label="Maturity on document" htmlFor="declared_maturity"><input id="declared_maturity" name="declared_maturity" type="date" className="input" /></Field>
            </div>
          </fieldset>
        </form>
      </Drawer>
    </>
  );
}
