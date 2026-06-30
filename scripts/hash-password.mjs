// Generate the SHA-256 hash for a password and write it to .env so the
// in-app password gate can check against it without storing the plaintext.
//
//   npm run set-password "your new password"
//
// Commit the updated .env (it holds only the hash) and redeploy. Changing the
// password automatically invalidates anyone's saved login.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run set-password "your new password"');
  process.exit(1);
}

const hash = createHash("sha256").update(pw).digest("hex");
const ENV = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");

let lines = existsSync(ENV) ? readFileSync(ENV, "utf8").split(/\r?\n/).filter(Boolean) : [];
lines = lines.filter((l) => !l.startsWith("VITE_PASSWORD_HASH="));
lines.push(`VITE_PASSWORD_HASH=${hash}`);
writeFileSync(ENV, lines.join("\n") + "\n");

console.log(`✓ Password set. Wrote VITE_PASSWORD_HASH to .env`);
console.log(`  ${hash}`);
console.log(`\n  Commit .env and redeploy. (Or set the same value in Vercel → Settings → Environment Variables.)`);
