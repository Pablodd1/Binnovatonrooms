import { describe, it, expect } from "vitest";
import { validateRequest } from "@/lib/validation";
import { z } from "zod";

describe("validateRequest", () => {
  it("should return the parsed data for valid input", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const data = { name: "Alice", age: 30 };

    const result = validateRequest(schema, data);

    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("should coerce values if the schema defines coercion", () => {
    const schema = z.object({
      age: z.coerce.number(),
    });
    const data = { age: "30" };

    const result = validateRequest(schema, data);

    expect(result).toEqual({ age: 30 });
  });

  it("should apply default values if defined in the schema", () => {
    const schema = z.object({
      status: z.string().default("active"),
    });
    const data = {};

    const result = validateRequest(schema, data);

    expect(result).toEqual({ status: "active" });
  });

  it("should throw an error with formatted issues for invalid input", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().min(18),
    });
    const data = { name: "Alice", age: 17 };

    expect(() => validateRequest(schema, data)).toThrow(
      /Validation failed: age: .*18/
    );
  });

  it("should format nested path errors correctly", () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
        })
      })
    });
    const data = { user: { profile: { email: "invalid" } } };

    expect(() => validateRequest(schema, data)).toThrow(
      /Validation failed: user\.profile\.email: .*email/i
    );
  });

  it("should separate multiple errors", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const data = { name: 123, age: "30" };

    expect(() => validateRequest(schema, data)).toThrow(
      /Validation failed: name: .*string.*age: .*number/i
    );
  });

  it("should rethrow non-Zod errors", () => {
    const mockSchema = {
      safeParse: () => {
        throw new Error("Unexpected database connection error");
      }
    };

    expect(() => validateRequest(mockSchema as any, {})).toThrowError("Unexpected database connection error");
  });
});
