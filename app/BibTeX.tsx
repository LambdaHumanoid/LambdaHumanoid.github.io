"use client";

import { useState } from "react";
import { citations } from "./citations";
import { ResourceIcon } from "./ResourceIcon";

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

  return <details className="bibtex-resource">
    <summary><ResourceIcon kind="citation" /><span>BibTeX</span><ResourceIcon kind="chevron" /></summary>
    <div className="bibtex-panel">
      <h2>Cite λ₀, EgoHumanoid-V2, and EgoAlign</h2>
      <p>Official arXiv citations. The λ₀ entry retains its current arXiv title.</p>
      <div className="bibtex-actions">
        <button type="button" onClick={copy}>Copy all</button>
        <a href="/citations.bib" download>Download .bib</a>
        <span role="status">{status}</span>
      </div>
      <pre role="region" tabIndex={0} aria-label="BibTeX citations"><code>{citations}</code></pre>
    </div>
  </details>;
}
