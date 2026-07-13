// Deliberately not a real dependency (no shiki/react-syntax-highlighter/
// prismjs) — the sandbox this project is built in has no npm registry
// access, so any new highlighting package would go straight to the user's
// CI as the first real compile/dependency-resolution check, same as how
// the TS2345 bug in MediaAttachments only surfaced there. This is a small,
// self-contained regex tokenizer instead: good enough to color the common
// tokens (keywords, strings, comments, numbers, types, function calls) for
// the languages this repo's own firmware/tooling code actually uses,
// with zero new dependencies and full local control over correctness.
//
// Every `cfg.<field>` used below is bound to a plain local const up
// front rather than accessed repeatedly as `cfg.blockComment` etc. —
// under this project's `noUncheckedIndexedAccess`/strict settings,
// narrowing an optional *property* doesn't reliably survive being
// re-read later the way narrowing a plain *variable* does (the exact
// bug fixed in MediaAttachments.tsx this session). Binding to a local
// once avoids relying on that narrowing at all.

export interface CodeToken {
  text: string;
  cls: "kw" | "str" | "cmt" | "type" | "num" | "fn" | "punc" | null;
}

interface LangConfig {
  lineComment: string | null;
  blockComment: [string, string] | null;
  strings: string[];
  keywords: Set<string>;
  types: Set<string>;
}

const C_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
  "static", "const", "volatile", "extern", "struct", "enum", "union", "typedef", "sizeof", "goto",
  "inline", "register", "signed", "unsigned", "void", "class", "public", "private", "protected",
  "namespace", "template", "new", "delete", "this", "virtual", "override", "using", "include",
  "define", "ifndef", "ifdef", "endif", "pragma",
]);
const C_TYPES = new Set(["int", "float", "double", "char", "bool", "long", "short", "auto"]);

const PY_KEYWORDS = new Set([
  "def", "class", "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "as",
  "import", "from", "return", "yield", "pass", "break", "continue", "lambda", "global", "nonlocal",
  "and", "or", "not", "in", "is", "None", "True", "False", "raise", "assert", "async", "await", "del",
]);
const PY_TYPES = new Set(["int", "float", "str", "bool", "list", "dict", "tuple", "set", "bytes"]);

const JS_KEYWORDS = new Set([
  "function", "const", "let", "var", "if", "else", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "return", "class", "extends", "new", "this", "super", "import", "export",
  "from", "as", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "in",
  "of", "yield", "delete", "void", "null", "undefined", "true", "false", "interface", "type", "enum",
  "implements", "public", "private", "protected", "readonly", "static", "namespace", "declare",
]);
const JS_TYPES = new Set(["string", "number", "boolean", "any", "unknown", "never", "object", "symbol"]);

const SH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function",
  "return", "export", "local", "in", "echo", "exit",
]);

const LANGUAGES: Record<string, LangConfig> = {
  c: { lineComment: "//", blockComment: ["/*", "*/"], strings: ['"', "'"], keywords: C_KEYWORDS, types: C_TYPES },
  python: { lineComment: "#", blockComment: null, strings: ['"""', "'''", '"', "'"], keywords: PY_KEYWORDS, types: PY_TYPES },
  javascript: { lineComment: "//", blockComment: ["/*", "*/"], strings: ['"', "'", "`"], keywords: JS_KEYWORDS, types: JS_TYPES },
  json: { lineComment: null, blockComment: null, strings: ['"'], keywords: new Set(), types: new Set() },
  yaml: { lineComment: "#", blockComment: null, strings: ['"', "'"], keywords: new Set(), types: new Set() },
  shell: { lineComment: "#", blockComment: null, strings: ['"', "'"], keywords: SH_KEYWORDS, types: new Set() },
  markdown: { lineComment: null, blockComment: null, strings: [], keywords: new Set(), types: new Set() },
  plain: { lineComment: null, blockComment: null, strings: [], keywords: new Set(), types: new Set() },
};

const EXT_TO_LANG: Record<string, string> = {
  c: "c", h: "c", cc: "c", cpp: "c", cxx: "c", hpp: "c", ino: "c",
  py: "python", pyw: "python",
  js: "javascript", jsx: "javascript", ts: "javascript", tsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json",
  yml: "yaml", yaml: "yaml",
  sh: "shell", bash: "shell", zsh: "shell",
  md: "markdown", markdown: "markdown",
};

export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "plain";
}

export function highlightCode(code: string, language: string): CodeToken[][] {
  const cfg = LANGUAGES[language] ?? LANGUAGES.plain;
  // Local bindings — see file-level comment on why.
  const lineComment = cfg?.lineComment ?? null;
  const blockComment = cfg?.blockComment ?? null;
  const blockStart = blockComment ? blockComment[0] : null;
  const blockEnd = blockComment ? blockComment[1] : null;
  const strings = cfg?.strings ?? [];
  const keywords = cfg?.keywords ?? new Set<string>();
  const types = cfg?.types ?? new Set<string>();

  const lines = code.split("\n");
  const result: CodeToken[][] = [];
  let inBlockComment = false;

  for (const line of lines) {
    const tokens: CodeToken[] = [];
    let i = 0;

    while (i < line.length) {
      const rest = line.slice(i);

      if (inBlockComment) {
        if (!blockEnd) {
          // Shouldn't happen (inBlockComment only ever gets set when
          // blockEnd is non-null), but keeps this branch total.
          tokens.push({ text: rest, cls: "cmt" });
          i = line.length;
          continue;
        }
        const endIdx = line.indexOf(blockEnd, i);
        if (endIdx === -1) {
          tokens.push({ text: rest, cls: "cmt" });
          i = line.length;
        } else {
          const end = endIdx + blockEnd.length;
          tokens.push({ text: line.slice(i, end), cls: "cmt" });
          i = end;
          inBlockComment = false;
        }
        continue;
      }

      if (blockStart && blockEnd && rest.startsWith(blockStart)) {
        const endIdx = line.indexOf(blockEnd, i + blockStart.length);
        if (endIdx === -1) {
          tokens.push({ text: rest, cls: "cmt" });
          inBlockComment = true;
          i = line.length;
        } else {
          const end = endIdx + blockEnd.length;
          tokens.push({ text: line.slice(i, end), cls: "cmt" });
          i = end;
        }
        continue;
      }

      if (lineComment && rest.startsWith(lineComment)) {
        tokens.push({ text: rest, cls: "cmt" });
        i = line.length;
        continue;
      }

      const quote = strings.find((q) => rest.startsWith(q));
      if (quote) {
        let end = quote.length;
        while (end < rest.length) {
          if (rest[end] === "\\") {
            end += 2;
            continue;
          }
          if (rest.startsWith(quote, end)) {
            end += quote.length;
            break;
          }
          end += 1;
        }
        end = Math.min(end, rest.length);
        tokens.push({ text: rest.slice(0, end), cls: "str" });
        i += end;
        continue;
      }

      // Bind each match's text to a local before use — same reasoning
      // as the file-level comment: `match[0]` re-read from the array
      // a second time isn't guaranteed to stay narrowed, so read it
      // once into a plain variable instead.
      const numText = /^\d[\d_.]*[a-zA-Z]*/.exec(rest)?.[0];
      if (numText) {
        tokens.push({ text: numText, cls: "num" });
        i += numText.length;
        continue;
      }

      const word = /^[A-Za-z_]\w*/.exec(rest)?.[0];
      if (word) {
        let cls: CodeToken["cls"] = null;
        if (keywords.has(word)) cls = "kw";
        else if (types.has(word)) cls = "type";
        else if (/^\s*\(/.test(rest.slice(word.length))) cls = "fn";
        tokens.push({ text: word, cls });
        i += word.length;
        continue;
      }

      const punc = /^[^\w\s]+/.exec(rest)?.[0];
      if (punc) {
        tokens.push({ text: punc, cls: "punc" });
        i += punc.length;
        continue;
      }

      tokens.push({ text: rest.charAt(0), cls: null });
      i += 1;
    }

    result.push(tokens);
  }

  return result;
}
