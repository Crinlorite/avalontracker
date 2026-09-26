// Acceso al dump público del juego (https://github.com/ao-data/ao-bin-dumps)
// compartido por los extractores: último commit, índice de plantillas y
// descarga cacheada en .cache/ao-bin-dumps/<sha>/ (fuera de git).
import fs from "node:fs";
import path from "node:path";

export const REPO = "ao-data/ao-bin-dumps";
export const ROOT = process.cwd();

export async function latestSha(): Promise<string> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/master`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "avalon-tracker-extract" },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return ((await r.json()) as { sha: string }).sha;
}

export async function listTemplates(sha: string): Promise<Map<string, string[]>> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${sha}?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "avalon-tracker-extract" },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const tree = ((await r.json()) as { tree: { path: string }[] }).tree;
  const idx = new Map<string, string[]>();
  for (const { path: p } of tree) {
    const m = /^templates\/([^/]+)\/(.+)\.template\.xml$/.exec(p);
    if (!m) continue;
    const list = idx.get(m[2]) ?? [];
    list.push(p);
    idx.set(m[2], list);
  }
  return idx;
}

export async function cached(sha: string, file: string): Promise<string> {
  const local = path.join(ROOT, ".cache/ao-bin-dumps", sha, file);
  if (fs.existsSync(local)) return fs.readFileSync(local, "utf8");
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${file}`);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  const text = await r.text();
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, text);
  return text;
}
