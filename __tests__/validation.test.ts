import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateRequest } from "@/lib/validation";

describe("validateRequest", () => {
  const testSchema = z.object({
    name: z.string(),
    age: z.number().min(18),
    address: z.object({
      city: z.string(),
    }),
  });

  it("should return parsed data for valid input", () => {
    const validData = {
      name: "John Doe",
      age: 30,
      address: {
        city: "New York",
      },
    };

    const result = validateRequest(testSchema, validData);
    expect(result).toEqual(validData);
  });

  it("should strip unknown properties during parsing", () => {
     const validDataWithExtra = {
      name: "John Doe",
      age: 30,
      extra: "field",
      address: {
        city: "New York",
        zip: "10001"
      },
    };

    const expectedResult = {
        name: "John Doe",
        age: 30,
        address: {
            city: "New York"
        }
    }

    const result = validateRequest(testSchema, validDataWithExtra);
    expect(result).toEqual(expectedResult);
  })

  it("should throw an error for invalid input", () => {
    const invalidData = {
      name: 123, // should be string
      age: 15, // should be min 18
      address: {}, // missing city
    };

    expect(() => validateRequest(testSchema, invalidData)).toThrowError(
      /Validation failed: name: .*string.*number; age: .*number.*>=18; address.city: .*string.*undefined/i
    );
  });

  it("should throw an error for missing input", () => {
     expect(() => validateRequest(testSchema, null)).toThrowError(
        /Validation failed:.*object.*null/i
     )
  })
});
