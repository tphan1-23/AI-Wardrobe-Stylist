import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyAddError } from "../frontend/src/services/add.ts";
import { friendlyClosetError } from "../frontend/src/services/closet.ts";
import { GENERIC_ERROR, unexpectedError } from "../frontend/src/services/errors.ts";
import { friendlyHouseholdError } from "../frontend/src/services/household.ts";
import { friendlyTodayError } from "../frontend/src/services/today.ts";

const RAW = 'new row violates row-level security policy for table "garments"';

afterEach(() => vi.restoreAllMocks());

describe("unexpected server errors", () => {
  it("show the person a generic message and keep the raw text in the developer log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(unexpectedError("closet", "secret_table constraint failed")).toBe(GENERIC_ERROR);
    expect(warn).toHaveBeenCalledWith("[closet] unexpected error:", "secret_table constraint failed");
  });

  it("never put internal names on screen, whichever service the error came from", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const shown = [
      friendlyHouseholdError(RAW),
      friendlyClosetError(RAW.replace("row-level security", "rls")),
      friendlyTodayError({ message: RAW, status: 500 }),
      friendlyAddError(RAW),
    ];
    for (const text of shown) {
      expect(text).toBe(GENERIC_ERROR);
      expect(text).not.toContain("garments");
    }
  });

  it("still explain the errors we expect in plain words", () => {
    expect(friendlyHouseholdError("invalid invite code")).toMatch(/invite code was not found/i);
    expect(friendlyClosetError(RAW)).toMatch(/could not be changed/i);
    expect(friendlyTodayError({ message: "x", status: 409 })).toMatch(/location/i);
    expect(friendlyAddError("", undefined)).toMatch(/could not reach the server/i);
  });
});
