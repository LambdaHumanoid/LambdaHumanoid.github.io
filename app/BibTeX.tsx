"use client";

import { useState } from "react";
import { citations } from "./citations";

export function BibTeX() {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(citations);
      setStatus("Copied all four citations.");
    } catch {
      setStatus("Select the text below to copy, or download the .bib file.");
    }
  }

  return <section className="content-section bibtex-section" id="bibtex" aria-labelledby="bibtex-title">
    <details className="bibtex-details">
    <summary className="bibtex-summary"><h2 id="bibtex-title">BibTeX</h2><span className="bibtex-toggle" aria-hidden="true"><span className="bibtex-show">Show citations</span><span className="bibtex-hide">Hide citations</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m6 9 6 6 6-6" /></svg></span></summary>
    <p className="bibtex-intro">Cite the λ₀ report and related work using their official arXiv entries.</p>
    <div className="bibtex-panel">
      <div className="bibtex-actions">
        <button type="button" onClick={copy}>Copy all</button>
        <a href="/citations.bib?v=35a2c0940a" download>Download .bib</a>
        <span role="status">{status}</span>
      </div>
      <pre role="region" tabIndex={0} aria-label="BibTeX citations"><code>{citations}</code></pre>
    </div>
    </details>
  </section>;
}
