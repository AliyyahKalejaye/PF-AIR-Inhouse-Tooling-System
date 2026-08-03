import { describe, expect, it } from "vitest";
import { detectLanguage, highlightCode } from "./code-highlight";

describe("detectLanguage", () => {
  it("maps common extensions to their language", () => {
    expect(detectLanguage("main.py")).toBe("python");
    expect(detectLanguage("index.ts")).toBe("javascript");
    expect(detectLanguage("firmware.c")).toBe("c");
    expect(detectLanguage("config.yml")).toBe("yaml");
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it("falls back to plain for an unknown or missing extension", () => {
    expect(detectLanguage("Makefile")).toBe("plain");
    expect(detectLanguage("data.xyz")).toBe("plain");
  });

  it("is case-insensitive on the extension", () => {
    expect(detectLanguage("Main.PY")).toBe("python");
  });
});

describe("highlightCode", () => {
  it("splits output into one token array per input line", () => {
    const result = highlightCode("a\nb\nc", "plain");
    expect(result).toHaveLength(3);
  });

  it("classifies a Python keyword and a string literal", () => {
    const lines = highlightCode('def f():\n    return "hi"', "python");
    const firstLine = lines[0] ?? [];
    const secondLine = lines[1] ?? [];

    expect(firstLine.some((t) => t.text === "def" && t.cls === "kw")).toBe(true);
    expect(secondLine.some((t) => t.cls === "str" && t.text === '"hi"')).toBe(true);
  });

  it("classifies a C line comment as a single comment token", () => {
    const [line] = highlightCode("int x = 1; // set x", "c");
    const commentToken = line?.find((t) => t.cls === "cmt");
    expect(commentToken?.text).toBe("// set x");
  });

  it("carries a block comment across multiple lines", () => {
    const lines = highlightCode("/* start\nstill a comment\nend */\nint x;", "c");
    expect(lines[0]?.every((t) => t.cls === "cmt" || t.text === "/* start")).toBe(true);
    expect(lines[1]?.[0]?.cls).toBe("cmt");
    expect(lines[2]?.some((t) => t.cls === "cmt")).toBe(true);
    // The block comment should have closed by the 4th line — "int" is a
    // real type token there ("int" is in C_TYPES, not C_KEYWORDS), not
    // still swallowed as a comment.
    expect(lines[3]?.some((t) => t.text === "int" && t.cls === "type")).toBe(true);
  });

  it("does not crash on an empty string", () => {
    expect(highlightCode("", "javascript")).toEqual([[]]);
  });

  it("falls back to the plain config for an unknown language", () => {
    const result = highlightCode("anything", "some-made-up-language");
    expect(result).toHaveLength(1);
  });
});
