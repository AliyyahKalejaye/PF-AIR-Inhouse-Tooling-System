"use client";

// Full-screen code repo browser — screen 17/17. "code" media items only
// ever store a repo URL (see MediaAttachments' Code Repo tile), so this
// fetches the file tree and file contents live from GitHub's public REST
// API rather than rendering anything uploaded/stored by us. Unauthenticated
// (no token to safely keep in a static-exported frontend), so it only
// works for public repos and is subject to GitHub's 60 req/hr per-IP rate
// limit — both are surfaced as readable errors rather than a blank pane.
//
// Syntax highlighting is the small local regex tokenizer in
// lib/code-highlight.ts, not a new npm dependency — see that file's
// header comment for why.

import { useEffect, useMemo, useState } from "react";
import type { ProjectMediaRead } from "@/lib/projects";
import {
  FileTreeNode,
  GitHubApiError,
  fetchFileContent,
  fetchRepoInfo,
  fetchRepoTree,
  buildFileTree,
  parseGitHubUrl,
} from "@/lib/github";
import { detectLanguage, highlightCode } from "@/lib/code-highlight";
import { DarkViewerTopBar, DOT_SEP } from "./DarkViewerTopBar";

interface Props {
  media: ProjectMediaRead;
  onClose: () => void;
}

const TOKEN_COLOR: Record<string, string> = {
  kw: "#a5b4fc",
  str: "#7ee787",
  cmt: "#6b7685",
  type: "#79c0ff",
  num: "#f0b968",
  fn: "#d2a8ff",
  punc: "#8b96a5",
};

function FileIcon({ isDir }: { isDir: boolean }) {
  if (isDir) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e3b341" strokeWidth="2" className="shrink-0">
        <path d="M4 4h5l2 3h9v11a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b96a5" strokeWidth="2" className="shrink-0">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TreeList({
  nodes,
  depth,
  selectedPath,
  onSelect,
}: {
  nodes: FileTreeNode[];
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            onClick={() => node.type === "blob" && onSelect(node.path)}
            className={`flex items-center gap-2 py-[6px] pr-[18px] font-mono text-[13px] ${
              node.type === "blob" ? "cursor-pointer" : ""
            } ${
              node.type === "blob" && node.path === selectedPath
                ? "border-l-2 border-indigo-400 bg-[#1c2333] font-semibold text-white"
                : "border-l-2 border-transparent text-slate-300 hover:bg-[#171e2a]"
            }`}
            style={{ paddingLeft: 18 + depth * 14 }}
          >
            <FileIcon isDir={node.type === "tree"} />
            <span className="truncate">{node.name}</span>
          </div>
          {node.children.length > 0 && (
            <TreeList nodes={node.children} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          )}
        </div>
      ))}
    </>
  );
}

export function CodeViewer({ media, onClose }: Props) {
  const parsed = useMemo(() => parseGitHubUrl(media.file_url), [media.file_url]);

  const [branch, setBranch] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoLoading, setRepoLoading] = useState(true);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  // The file tree is a fixed 264px sidebar always visible on desktop, but
  // that eats most of a phone's width — below `sm` it becomes a toggled
  // overlay instead (closed by default so the code pane gets the room),
  // opened via the "Files" button added to the top bar's rightExtra.
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!parsed) {
      setRepoLoading(false);
      return;
    }
    let cancelled = false;
    setRepoLoading(true);
    setRepoError(null);

    (async () => {
      try {
        const info = await fetchRepoInfo(parsed.owner, parsed.repo);
        const ref = parsed.ref ?? info.defaultBranch;
        const entries = await fetchRepoTree(parsed.owner, parsed.repo, ref);
        if (cancelled) return;
        const fileTree = buildFileTree(entries);
        setFullName(info.fullName);
        setBranch(ref);
        setTree(fileTree);

        const firstFile = findFirstFile(fileTree);
        if (firstFile) setSelectedPath(firstFile);
      } catch (err) {
        if (!cancelled) {
          setRepoError(err instanceof GitHubApiError ? err.message : "Couldn't load this repository.");
        }
      } finally {
        if (!cancelled) setRepoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsed]);

  useEffect(() => {
    if (!parsed || !branch || !selectedPath) return;
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);

    fetchFileContent(parsed.owner, parsed.repo, selectedPath, branch)
      .then((content) => {
        if (!cancelled) setFileContent(content);
      })
      .catch((err) => {
        if (!cancelled) {
          setFileContent(null);
          setFileError(err instanceof GitHubApiError ? err.message : "Couldn't load this file.");
        }
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parsed, branch, selectedPath]);

  const highlighted = useMemo(() => {
    if (!fileContent || !selectedPath) return null;
    return highlightCode(fileContent, detectLanguage(selectedPath));
  }, [fileContent, selectedPath]);

  const topBar = (
    <DarkViewerTopBar
      icon={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
        </svg>
      }
      iconBg="linear-gradient(135deg,#4f46e5,#7c3aed)"
      title={media.filename ?? fullName ?? "Code Repository"}
      subtitle={
        fullName ? (
          <>
            <span className="font-mono">{fullName}</span>
            {branch && (
              <>
                {DOT_SEP}
                <span className="font-mono">{branch}</span>
              </>
            )}
          </>
        ) : undefined
      }
      onClose={onClose}
      rightExtra={
        <>
          {!repoLoading && !repoError && (
            <button
              type="button"
              onClick={() => setMobileTreeOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-white/[.14] bg-white/[.08] px-3.5 py-2.5 text-[12.5px] font-semibold text-slate-200 hover:bg-white/[.14] sm:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
              Files
            </button>
          )}
          <a
            href={media.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/[.14] bg-white/[.08] px-3.5 py-2.5 text-[12.5px] font-semibold text-slate-200 hover:bg-white/[.14]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span className="hidden sm:inline">Open on GitHub</span>
          </a>
        </>
      }
    />
  );

  if (!parsed) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117] text-[#e6edf3]">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="max-w-md text-[13.5px] text-slate-400">
            This link isn&apos;t a GitHub repository, so it can&apos;t be previewed here.
          </p>
          <a href={media.file_url} target="_blank" rel="noreferrer" className="btn-primary">
            Open link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117] text-[#e6edf3]" style={{ fontFamily: "Inter, sans-serif" }}>
      {topBar}

      {repoLoading ? (
        <div className="flex flex-1 items-center justify-center text-[13.5px] text-slate-400">Loading repository…</div>
      ) : repoError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="max-w-md text-[13.5px] text-slate-400">{repoError}</p>
          <a href={media.file_url} target="_blank" rel="noreferrer" className="btn-primary">
            Open on GitHub
          </a>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 border-t border-[#232b36]">
          {mobileTreeOpen && (
            <div
              className="fixed inset-0 z-20 bg-black/50 sm:hidden"
              onClick={() => setMobileTreeOpen(false)}
            />
          )}
          <div
            className={`${
              mobileTreeOpen ? "flex" : "hidden"
            } absolute inset-y-0 left-0 z-30 w-[82vw] max-w-[280px] flex-col overflow-y-auto border-r border-[#232b36] bg-[#10151d] py-3.5 sm:static sm:z-auto sm:flex sm:w-[264px] sm:max-w-none sm:shrink-0`}
          >
            <div className="px-[18px] pb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Files</div>
            {tree.length === 0 ? (
              <div className="px-[18px] text-[12.5px] text-slate-500">Empty repository.</div>
            ) : (
              <TreeList
                nodes={tree}
                depth={0}
                selectedPath={selectedPath}
                onSelect={(path) => {
                  setSelectedPath(path);
                  setMobileTreeOpen(false);
                }}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col bg-[#0d1117]">
            {selectedPath && (
              <div className="flex h-[42px] shrink-0 items-center border-b border-[#232b36] bg-[#131a24] px-4 font-mono text-[13px] font-medium text-[#e6edf3]">
                {selectedPath}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {fileLoading ? (
                <div className="p-6 text-[13px] text-slate-500">Loading file…</div>
              ) : fileError ? (
                <div className="p-6 text-[13px] text-rose-400">{fileError}</div>
              ) : !selectedPath ? (
                <div className="p-6 text-[13px] text-slate-500">Select a file to preview it.</div>
              ) : (
                <div className="flex">
                  <div
                    className="select-none border-r border-[#232b36] px-4 py-4 text-right font-mono text-[13px] leading-[21px] text-[#3f4a5a]"
                  >
                    {(highlighted ?? []).map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <pre className="flex-1 overflow-x-auto px-6 py-4 font-mono text-[13px] leading-[21px]">
                    {(highlighted ?? []).map((lineTokens, i) => (
                      <div key={i}>
                        {lineTokens.length === 0
                          ? " "
                          : lineTokens.map((tok, j) => (
                              <span
                                key={j}
                                style={{
                                  color: tok.cls ? TOKEN_COLOR[tok.cls] : undefined,
                                  fontStyle: tok.cls === "cmt" ? "italic" : undefined,
                                }}
                              >
                                {tok.text}
                              </span>
                            ))}
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function findFirstFile(nodes: FileTreeNode[]): string | null {
  const readme = nodes.find((n) => n.type === "blob" && /^readme/i.test(n.name));
  if (readme) return readme.path;
  for (const node of nodes) {
    if (node.type === "blob") return node.path;
  }
  for (const node of nodes) {
    if (node.type === "tree") {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
}
