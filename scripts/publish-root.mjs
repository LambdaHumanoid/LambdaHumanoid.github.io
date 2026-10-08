import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Pages publishes main at /. Keep the downloadable offline folder intact.
for (const name of ['index.html', 'favicon.svg', 'paper.pdf', 'citations.bib', 'figures', 'motion', 'videos', 'offline']) {
  await cp(path.join(root, 'offline-site', name), path.join(root, name), { recursive: true });
}
console.log('Published the standalone project page at the repository root.');
