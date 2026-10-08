"use client";

import { useState } from "react";
import { citations } from "./citations";

export function BibTeX() {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(citations);
      setStatus("Copied all three citations.");
    } catch {
      setStatus("Select the text below to copy, or download the .bib file.");
    }
  }

  return <section className="content-section bibtex-section" id="bibtex" aria-labelledby="bibtex-title">
    <div className="section-intro"><div><p className="section-label">Citation</p><h2 id="bibtex-title">BibTeX</h2></div><p>Cite λ₀, EgoHumanoid-V2, and EgoAlign using their official arXiv entries.</p></div>
    <div className="bibtex-panel">
      <div className="bibtex-actions">
        <button type="button" onClick={copy}>Copy all</button>
        <a href="/citations.bib" download>Download .bib</a>
        <span role="status">{status}</span>
      </div>
      <pre role="region" tabIndex={0} aria-label="BibTeX citations"><code>{citations}</code></pre>
    </div>
  </section>;
}
