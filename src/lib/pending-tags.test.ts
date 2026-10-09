import { describe, expect, it } from "vitest";
import {
  buildPendingTagRequest,
  createDefaultPendingTags,
  createPendingTag,
  createUniqueLabel,
  getDefaultTagLabel,
  getPendingTagAction,
  refreshPendingLabels,
  type PendingTag,
} from "./pending-tags";

const labelsOf = (tags: PendingTag[]) => tags.map((tag) => `${tag.label}:${tag.action}`);

/** A new pending tag whose name was typed by hand. */
function createEditedTag(label: string): PendingTag {
  return { key: "edited", source: "new", label, isLabelEdited: true, action: "start" };
}

describe("getDefaultTagLabel", () => {
  it("names tags by kind and action", () => {
    expect(getDefaultTagLabel("timer", "start", "Roupa")).toBe("Máquina");
    expect(getDefaultTagLabel("timer", "complete", "Roupa")).toBe("Estendal");
    expect(getDefaultTagLabel("until_ack", "start", "Lixo")).toBe("Porta");
    expect(getDefaultTagLabel("recurring", "start", "  Regar  ")).toBe("Regar");
    expect(getDefaultTagLabel("recurring", "start", "")).toBe("Tag");
  });
});

describe("getPendingTagAction", () => {
  it("keeps the action only for timers", () => {
    expect(getPendingTagAction("timer", "complete")).toBe("complete");
    expect(getPendingTagAction("until_ack", "complete")).toBe("start");
    expect(getPendingTagAction("recurring", "complete")).toBe("start");
  });
});

describe("createUniqueLabel / createPendingTag", () => {
  it("numbers repeated default names", () => {
    expect(createUniqueLabel("Porta", [])).toBe("Porta");
    expect(createUniqueLabel("Porta", ["Porta"])).toBe("Porta 2");
    expect(createUniqueLabel("Porta", ["Porta", "Porta 2"])).toBe("Porta 3");
  });

  it("avoids a second identical default name", () => {
    const first = createPendingTag("until_ack", "start", "Lixo");
    const second = createPendingTag("until_ack", "start", "Lixo", [first]);
    expect(second.label).toBe("Porta 2");
  });
});

describe("createDefaultPendingTags", () => {
  it("starts timers with one Máquina · start tag", () => {
    expect(labelsOf(createDefaultPendingTags("timer", ""))).toEqual(["Máquina:start"]);
  });

  it("uses the task name for recurring tasks", () => {
    expect(labelsOf(createDefaultPendingTags("recurring", "Regar"))).toEqual(["Regar:start"]);
  });
});

describe("refreshPendingLabels", () => {
  it("renames untouched defaults when the kind or name changes", () => {
    const tags = [createPendingTag("timer", "start", ""), createPendingTag("timer", "complete", "")];
    expect(labelsOf(refreshPendingLabels(tags, "until_ack", ""))).toEqual(["Porta:start", "Porta 2:start"]);
    expect(labelsOf(refreshPendingLabels(tags, "recurring", "Regar"))).toEqual(["Regar:start", "Regar 2:start"]);
  });

  it("keeps names typed by hand", () => {
    const edited = createEditedTag("Cozinha");
    expect(labelsOf(refreshPendingLabels([edited], "until_ack", ""))).toEqual(["Cozinha:start"]);
  });

  it("normalises existing tags' action so the screen matches what is saved", () => {
    const existing: PendingTag = { key: "x", source: "existing", tagId: "t1", label: "Estendal", action: "complete" };
    expect(refreshPendingLabels([existing], "until_ack", "")[0].action).toBe("start");
    expect(refreshPendingLabels([existing], "timer", "")[0].action).toBe("complete");
  });

  it("does not reuse a name already taken by an existing tag", () => {
    const existing: PendingTag = { key: "x", source: "existing", tagId: "t1", label: "Porta", action: "start" };
    const fresh = createPendingTag("timer", "start", "");
    expect(labelsOf(refreshPendingLabels([fresh, existing], "until_ack", ""))).toEqual(["Porta 2:start", "Porta:start"]);
  });
});

describe("buildPendingTagRequest", () => {
  const timerTask = { id: "task-1", kind: "timer" as const, name: "Roupa" };

  it("creates new tags with the task id and action", () => {
    const tag = createPendingTag("timer", "complete", "Roupa");
    expect(buildPendingTagRequest(tag, timerTask)).toEqual({
      type: "create",
      input: { label: "Estendal", taskId: "task-1", action: "complete" },
    });
  });

  it("falls back to the default name when the label was cleared", () => {
    const tag = createEditedTag("  ");
    expect(buildPendingTagRequest(tag, timerTask)).toMatchObject({ input: { label: "Máquina" } });
  });

  it("assigns existing tags, forcing start for non-timers", () => {
    const existing: PendingTag = { key: "x", source: "existing", tagId: "t1", label: "Estendal", action: "complete" };
    expect(buildPendingTagRequest(existing, { id: "task-2", kind: "until_ack", name: "Lixo" })).toEqual({
      type: "assign",
      tagId: "t1",
      input: { taskId: "task-2", action: "start" },
    });
  });
});
