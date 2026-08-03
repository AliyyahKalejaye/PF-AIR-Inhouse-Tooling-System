// Smoke tests for the pure, no-network parts of lib/github.ts —
// parseGitHubUrl and buildFileTree. fetchRepoInfo/fetchRepoTree/
// fetchFileContent hit the real GitHub API and aren't covered here (no
// network mocking infra set up yet — see this file's sibling test files
// for the same "pure logic only" scoping decision).
import { describe, expect, it } from "vitest";
import { buildFileTree, parseGitHubUrl } from "./github";

describe("parseGitHubUrl", () => {
  it("parses a plain repo root URL", () => {
    expect(parseGitHubUrl("https://github.com/proforce/example")).toEqual({
      owner: "proforce",
      repo: "example",
      ref: null,
    });
  });

  it("strips a trailing .git", () => {
    expect(parseGitHubUrl("https://github.com/proforce/example.git")).toEqual({
      owner: "proforce",
      repo: "example",
      ref: null,
    });
  });

  it("strips a trailing slash", () => {
    expect(parseGitHubUrl("https://github.com/proforce/example/")).toEqual({
      owner: "proforce",
      repo: "example",
      ref: null,
    });
  });

  it("extracts the branch from a /tree/<branch> deep link", () => {
    expect(parseGitHubUrl("https://github.com/proforce/example/tree/dev")).toEqual({
      owner: "proforce",
      repo: "example",
      ref: "dev",
    });
  });

  it("returns null for a non-GitHub URL", () => {
    expect(parseGitHubUrl("https://gitlab.com/proforce/example")).toBeNull();
  });

  it("returns null for a GitHub URL missing a repo", () => {
    expect(parseGitHubUrl("https://github.com/proforce")).toBeNull();
  });

  it("returns null for a completely malformed URL", () => {
    expect(parseGitHubUrl("not a url")).toBeNull();
  });
});

describe("buildFileTree", () => {
  it("nests blobs under their parent tree, folders before files", () => {
    const tree = buildFileTree([
      { path: "README.md", type: "blob" },
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob" },
      { path: "src/lib/util.ts", type: "blob" },
    ]);

    expect(tree.map((n) => n.name)).toEqual(["src", "README.md"]);

    const src = tree[0];
    expect(src?.type).toBe("tree");
    expect(src?.children.map((n) => n.name)).toEqual(["lib", "index.ts"]);

    const lib = src?.children[0];
    expect(lib?.children.map((n) => n.name)).toEqual(["util.ts"]);
    expect(lib?.children[0]?.path).toBe("src/lib/util.ts");
  });

  it("returns an empty tree for no entries", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("does not duplicate a directory that has both an explicit tree entry and child files", () => {
    // Regression test: GitHub's recursive tree API always returns an
    // explicit `tree`-type entry for every directory *in addition to*
    // the blob entries for files inside it — buildFileTree used to
    // treat that explicit entry as a leaf and separately re-create the
    // same directory when a child file was processed, producing two
    // "src" nodes (one empty) instead of one.
    const tree = buildFileTree([
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob" },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("src");
    expect(tree[0]?.children.map((n) => n.name)).toEqual(["index.ts"]);
  });

  it("still includes an explicitly-listed empty directory", () => {
    const tree = buildFileTree([{ path: "empty-dir", type: "tree" }]);
    expect(tree).toEqual([{ name: "empty-dir", path: "empty-dir", type: "tree", children: [] }]);
  });
});
