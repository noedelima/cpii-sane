// Atualiza Auth Settings do projeto Supabase para autorizar redirect ao GitHub Pages.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const ref = env.SUPABASE_PROJECT_REF;
const pat = env.SUPABASE_PAT;

const siteUrl = "https://noedelima.github.io/cpii-sane/";
const extraRedirects = [
  "https://noedelima.github.io/cpii-sane/**",
  "http://localhost:5173/**",
];

// GET atual
const getR = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/config/auth`,
  { headers: { Authorization: `Bearer ${pat}` } }
);
const cur = await getR.json();
console.log("URI_ALLOW_LIST atual:", cur.uri_allow_list);
console.log("SITE_URL atual:", cur.site_url);

const newAllow = Array.from(
  new Set([...(cur.uri_allow_list?.split(",").map((s) => s.trim()).filter(Boolean) ?? []), ...extraRedirects])
).join(",");

const patchR = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ site_url: siteUrl, uri_allow_list: newAllow }),
  }
);
const txt = await patchR.text();
console.log(`PATCH ${patchR.status}:`, txt.substring(0, 400));
