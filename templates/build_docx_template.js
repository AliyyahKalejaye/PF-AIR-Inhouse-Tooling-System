// Builds the Project Write-Up template .docx. Section headings below are
// the canonical (first-alias) text for each field in
// backend/app/services/document_parser.py's _FIELD_ALIASES, using real
// Word Heading 1 styles so the "Upload a Document" parser auto-detects
// them and fills in the project form. Do not reword the 7 section
// headings — they're matched fuzzily but the canonical text guarantees a
// clean match with no risk of falling below threshold.

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} = require("docx");

const NAVY = "0F172A";
const INDIGO = "4F46E5";
const MUTED = "64748B";
const PLACEHOLDER = "94A3B8";

function coverTitle() {
  return [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "PROFORCE AIRSYSTEMS",
          bold: true,
          color: INDIGO,
          size: 20,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0", space: 8 } },
      children: [
        new TextRun({
          text: "Project Write-Up Template",
          bold: true,
          color: NAVY,
          size: 48,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [
        new TextRun({
          text:
            "Fill in each section below, then upload this file from Add New Project → " +
            "Upload a Document. Section headings are matched automatically — don't rename " +
            "them. Leave a section blank if it doesn't apply; you can always fill it in later " +
            "on the review screen or by editing the project afterwards.",
          italics: true,
          color: MUTED,
          size: 21,
          font: "Arial",
        }),
      ],
    }),
  ];
}

function section(heading, hint, exampleLines) {
  const paras = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 80 },
      children: [new TextRun({ text: heading })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: hint,
          italics: true,
          color: PLACEHOLDER,
          size: 20,
          font: "Arial",
        }),
      ],
    }),
  ];
  for (const line of exampleLines) {
    paras.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: line, size: 22, font: "Arial" })],
      })
    );
  }
  // A couple of blank editable lines so the doc doesn't look cramped in Word.
  paras.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "" })] }));
  return paras;
}

const doc = new Document({
  sections: [
    {
      properties: {
        page: { size: { width: 12240, height: 15840 } }, // US Letter
      },
      children: [
        ...coverTitle(),

        ...section(
          "Project Title",
          "The project's name, as it should appear in the Projects list.",
          ["e.g. Quadcopter Payload Release Mechanism"]
        ),

        ...section(
          "Problem Statement",
          "What problem is this project solving, and for whom? 2–4 sentences is plenty — " +
            "this becomes the project's list-view snippet.",
          []
        ),

        ...section(
          "Abstract",
          "A short summary of the approach/solution — what was built and how it works, " +
            "at a high level.",
          []
        ),

        ...section(
          "Specifications",
          "Technical specifications: dimensions, materials, tolerances, power/weight " +
            "budgets, standards it must meet, etc.",
          []
        ),

        ...section(
          "Requirement",
          "Requirements or acceptance criteria — what has to be true for this project to " +
            "be considered done.",
          []
        ),

        ...section(
          "Next Steps",
          "What's left to do, in priority order. Fine to leave blank for a finished project.",
          []
        ),

        ...section(
          "Note",
          "Anything else worth recording — open questions, decisions made and why, risks, " +
            "links to related projects.",
          []
        ),

        new Paragraph({
          spacing: { before: 400 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0", space: 8 } },
          children: [
            new TextRun({
              text:
                "Tip: attach photos, CAD files, videos, or code repo links after creating the " +
                "project, from the project's own page — embedded images in this document are " +
                "picked up automatically, but everything else (video, CAD, code) should be " +
                "attached separately.",
              italics: true,
              color: MUTED,
              size: 18,
              font: "Arial",
            }),
          ],
        }),
      ],
    },
  ],
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: NAVY } },
      heading1: {
        run: { font: "Arial", size: 26, bold: true, color: INDIGO },
        paragraph: { spacing: { before: 320, after: 80 } },
      },
    },
  },
});

Packer.toBuffer(doc).then((buf) => {
  require("fs").writeFileSync("Project_Writeup_Template.docx", buf);
  console.log("done");
});
