import { describe, expect, it } from "vitest";
import { PROJECT_STATUS_ORDER, projectStatusStyle } from "./project-status";

describe("projectStatusStyle", () => {
  it("returns a style for every status in PROJECT_STATUS_ORDER", () => {
    for (const status of PROJECT_STATUS_ORDER) {
      const style = projectStatusStyle(status);
      expect(style.label).toBeTruthy();
      expect(style.dot).toBeTruthy();
      expect(style.pill).toBeTruthy();
    }
  });

  it("labels match the approved mockup's copy", () => {
    expect(projectStatusStyle("active").label).toBe("Active");
    expect(projectStatusStyle("done").label).toBe("Done");
    expect(projectStatusStyle("paused").label).toBe("Paused");
    expect(projectStatusStyle("relegated").label).toBe("Relegated");
  });
});

describe("PROJECT_STATUS_ORDER", () => {
  it("matches the mockup's Active → Done → Paused → Relegated order", () => {
    expect(PROJECT_STATUS_ORDER).toEqual(["active", "done", "paused", "relegated"]);
  });
});
