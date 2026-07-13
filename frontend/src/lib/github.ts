// GitHub REST API helpers for the Code Repo viewer (screen 17). "code"
// media items only ever store a repo URL (see MediaAttachments' Code Repo
// tile — it links a URL, it never uploads source files), so browsing the
// actual source has to happen live against GitHub's public API. This is
// unauthenticated (no token in a static-exported frontend to keep one
// safely), so it's subject to GitHub's 60 req/hr per-IP rate limit and
// only works for public repos — both surfaced as readable errors below
// rather than a silent blank screen.

const GITHUB_API = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  ref: string | null;
}

// Handles the URL shapes people actually paste: the plain repo root,
// with or without a trailing slash or ".git", and a /tree/<branch> deep
// link (in which case we pin to that branch instead of the default one).
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  let repo = parts[1];
  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/i, "");

  // Bind to locals before narrowing — with noUncheckedIndexedAccess,
  // repeated `parts[2]`/`parts[3]` index-access reads don't reliably
  // narrow the same way a plain variable does (see the identical
  // lesson learned in MediaAttachments.tsx this session).
  const treeSegment = parts[2];
  const refSegment = parts[3];
  let ref: string | null = null;
  if (treeSegment === "tree" && refSegment) {
    ref = decodeURIComponent(refSegment);
  }

  return { owner, repo, ref };
}

async function githubFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    if (res.status === 404) throw new GitHubApiError(404, "Repository or file not found — it may be private.");
    if (res.status === 403) throw new GitHubApiError(403, "GitHub API rate limit reached. Try again in a few minutes.");
    throw new GitHubApiError(res.status, `GitHub API error (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export interface RepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
}

export async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const data = await githubFetch<{ full_name: string; description: string | null; default_branch: string }>(
    `/repos/${owner}/${repo}`
  );
  return { fullName: data.full_name, description: data.description, defaultBranch: data.default_branch };
}

export interface GitTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export async function fetchRepoTree(owner: string, repo: string, ref: string): Promise<GitTreeEntry[]> {
  const data = await githubFetch<{ tree: GitTreeEntry[]; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  );
  return data.tree.filter((entry) => entry.type === "blob" || entry.type === "tree");
}

export async function fetchFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
  const data = await githubFetch<{ content?: string; encoding?: string }>(
    `/repos/${owner}/${repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(ref)}`
  );
  if (!data.content || data.encoding !== "base64") {
    throw new GitHubApiError(0, "This file is too large to preview here.");
  }
  const binary = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// --- File tree shaping -----------------------------------------------

export interface FileTreeNode {
  name: string;
  path: string;
  type: "blob" | "tree";
  children: FileTreeNode[];
}

export function buildFileTree(entries: GitTreeEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirs = new Map<string, FileTreeNode>();

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const segments = entry.path.split("/");
    let siblings = root;
    let pathSoFar = "";
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      if (!name) continue;
      pathSoFar = pathSoFar ? `${pathSoFar}/${name}` : name;
      const isLeaf = i === segments.length - 1;
      if (isLeaf) {
        siblings.push({ name, path: pathSoFar, type: entry.type, children: [] });
      } else {
        let dir = dirs.get(pathSoFar);
        if (!dir) {
          dir = { name, path: pathSoFar, type: "tree", children: [] };
          dirs.set(pathSoFar, dir);
          siblings.push(dir);
        }
        siblings = dir.children;
      }
    }
  }

  // Folders first, then files, alphabetically within each group — matches
  // how the mockup lists src/, lib/, test/ ahead of the loose root files.
  function sortTree(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortTree(n.children));
  }
  sortTree(root);

  return root;
}
