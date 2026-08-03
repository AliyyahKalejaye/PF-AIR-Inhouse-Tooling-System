// One real render-and-interact smoke test, proving the vitest + Testing
// Library + jsdom setup (vitest.config.ts) actually works end to end —
// not just the pure-logic-only tests elsewhere in this phase. Picked
// DarkViewerTopBar specifically because it has no hooks, no context
// dependency (no auth, no router), and no Next.js-specific components
// (next/link, next/image) that would need extra mocking to render under
// plain jsdom.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DarkViewerTopBar } from "./DarkViewerTopBar";

describe("DarkViewerTopBar", () => {
  it("renders the title and subtitle", () => {
    render(
      <DarkViewerTopBar
        icon={<span>icon</span>}
        title="test-image.png"
        subtitle="Image"
        onClose={() => {}}
      />
    );

    expect(screen.getByText("test-image.png")).toBeTruthy();
    expect(screen.getByText("Image")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<DarkViewerTopBar icon={<span>icon</span>} title="test.png" onClose={onClose} />);

    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("only renders a download link when downloadUrl is provided", () => {
    const { rerender } = render(
      <DarkViewerTopBar icon={<span>icon</span>} title="test.png" onClose={() => {}} />
    );
    expect(screen.queryByTitle("Download")).toBeNull();

    rerender(
      <DarkViewerTopBar
        icon={<span>icon</span>}
        title="test.png"
        onClose={() => {}}
        downloadUrl="https://example.com/test.png"
      />
    );
    const downloadLink = screen.getByTitle("Download");
    expect(downloadLink.getAttribute("href")).toBe("https://example.com/test.png");
  });
});
