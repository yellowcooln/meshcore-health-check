import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PATCH_MARKER = 'mesh-health-check node18 compat patch';
const TARGET = 'dist/crypto/ed25519-verifier.js';
const ORIGINAL = 'const ed25519 = __importStar(require("@noble/ed25519"));';
const REPLACEMENT = `let ed25519 = {
    etc: {},
    verify: async () => {
        throw new Error("noble-ed25519 unavailable");
    }
};
try {
    ed25519 = __importStar(require("@noble/ed25519"));
}
catch (error) {
    ed25519 = {
        etc: {},
        verify: async () => {
            throw error;
        }
    };
}
// ${PATCH_MARKER}`;

function resolveVerifierPath() {
  const packageJsonPath = require.resolve('@michaelhart/meshcore-decoder/package.json');
  return path.join(path.dirname(packageJsonPath), TARGET);
}

function main() {
  let verifierPath = '';
  try {
    verifierPath = resolveVerifierPath();
  } catch {
    console.log('[postinstall] @michaelhart/meshcore-decoder not installed, skipping patch');
    return;
  }

  const source = fs.readFileSync(verifierPath, 'utf8');
  if (source.includes(PATCH_MARKER)) {
    console.log('[postinstall] meshcore decoder already patched');
    return;
  }
  if (!source.includes(ORIGINAL)) {
    throw new Error(`Unable to find decoder patch target in ${verifierPath}`);
  }

  fs.writeFileSync(verifierPath, source.replace(ORIGINAL, REPLACEMENT), 'utf8');
  console.log('[postinstall] patched meshcore decoder for Node 18 compatibility');
}

main();
