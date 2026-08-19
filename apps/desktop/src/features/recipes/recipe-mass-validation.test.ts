import { describe, expect, it } from "vitest";

import {
  FINISHED_MASS_EXCEEDS_INPUT_MESSAGE,
  finishedMassLimitIssue,
} from "./recipe-mass-validation";

describe("finished mass validation", () => {
  it.each([
    [null, "1000"],
    ["999.999999999999999999", "1000"],
    ["1000", "1000"],
    ["1000.000000000000000000", "1000"],
  ])("allows finished mass %s for input mass %s", (finished, input) => {
    expect(finishedMassLimitIssue(finished, input)).toBeNull();
  });

  it("rejects a finished mass that exceeds input by an exact decimal fraction", () => {
    expect(
      finishedMassLimitIssue("1000.000000000000000001", "1000"),
    ).toEqual({
      code: "finished_mass_exceeds_input",
      severity: "error",
      message: FINISHED_MASS_EXCEEDS_INPUT_MESSAGE,
      field: "finishedMassGrams",
      itemId: null,
    });
  });
});
