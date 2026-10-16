"use client";

import { useState } from "react";
import { citations } from "./citations";

const entries = citations.trim().split(/\n\s*\n(?=@)/);
const reportCitation = entries[0];
const relatedCitations = entries.slice(1).join("\n\n");

function CitationPanel({ text, label, download = false }: { text: string; label: string; download?: boolean }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus("Copied."); }
    catch { setStatus("Select the text to copy."); }
  }
  return <div className="bibtex-panel">
    <div className="bibtex-actions">
      <button type="button" onClick={copy}>{download ? "Copy citation" : "Copy related citations"}</button>
      {download && <a href="/citations.bib?v=35a2c0940a" download>Download .bib</a>}
      <span role="status">{status}</span>
    </div>
    <pre role="region" tabIndex={0} aria-label={label}><code>{text}</code></pre>
  </div>;
}

export function BibTeX() {
  return <section className="content-section bibtex-section" id="bibtex" aria-labelledby="bibtex-title">
    <details className="bibtex-details" open>
      <summary className="bibtex-summary"><h2 id="bibtex-title">BibTeX</h2><span className="bibtex-toggle" aria-hidden="true"><span className="bibtex-show">Show citations</span><span className="bibtex-hide">Hide citations</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 9 6 6 6-6" /></svg></span></summary>
      <CitationPanel text={reportCitation} label="λ₀ report citation" download />
      <details className="related-citations">
        <summary>Related works</summary>
        <CitationPanel text={relatedCitations} label="Related work citations" />
      </details>
    </details>
  </section>;
}
