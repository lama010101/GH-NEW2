import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_PATH = join(__dirname, '../public/sw.js');
const VERSION_LINE_REGEX = /const\s+SW_VERSION\s*=\s*['"`][^'"`]*['"`]\s*;/;

export function injectServiceWorkerVersion() {
  const content = readFileSync(SW_PATH, 'utf8');
  const match = content.match(VERSION_LINE_REGEX);
  if (!match) {
    throw new Error(`[inject-sw-version] Could not find SW_VERSION line in ${SW_PATH}`);
  }

  const versionLine = match[0];
  const normalized = content.replace(versionLine, `const SW_VERSION = '__SW_VERSION__';`);

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  let version;
  let source;
  if (sha) {
    version = sha;
    source = 'VERCEL_GIT_COMMIT_SHA';
  } else {
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
    version = `dev-${hash}`;
    source = 'content-hash fallback';
  }

  const newVersionLine = `const SW_VERSION = '${version}';`;
  const newContent = content.replace(versionLine, newVersionLine);
  writeFileSync(SW_PATH, newContent, 'utf8');
  console.log(`[inject-sw-version] SW_VERSION=${version} (${source})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  injectServiceWorkerVersion();
}
