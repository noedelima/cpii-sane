// Define GitHub Actions secrets em noedelima/cpii-sane via API REST.
// Usa o token do gh CLI (autenticado).
// Uso: node scripts/set-gh-secrets.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import sodium from "libsodium-wrappers";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const owner = "noedelima";
const repo = "cpii-sane";
const ghToken = execSync("gh auth token").toString().trim();

async function ghApi(path, init = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${path}: ${txt.substring(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
}

await sodium.ready;

const pubKey = await ghApi(`/repos/${owner}/${repo}/actions/secrets/public-key`);
console.log(`Public key obtida (key_id=${pubKey.key_id}).`);

async function setSecret(name, value) {
  const binKey = sodium.from_base64(pubKey.key, sodium.base64_variants.ORIGINAL);
  const binSec = sodium.from_string(value);
  const enc = sodium.crypto_box_seal(binSec, binKey);
  const b64 = sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
  await ghApi(`/repos/${owner}/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: b64, key_id: pubKey.key_id }),
  });
  console.log(`  [+] Secret ${name} definido (${value.length} chars).`);
}

await setSecret("VITE_SUPABASE_URL", env.VITE_SUPABASE_URL);
await setSecret("VITE_SUPABASE_ANON_KEY", env.VITE_SUPABASE_ANON_KEY);

const list = await ghApi(`/repos/${owner}/${repo}/actions/secrets`);
console.log(
  `\nSecrets do repo: ${list.secrets.map((s) => s.name).join(", ")}`
);
