import { z } from "zod";

/**
 * Single source of truth for sevDesk object-ID validation.
 *
 * Every sevDesk object is addressed by a numeric ID that this server interpolates
 * directly into the request path (e.g. `/Voucher/${id}`). Constraining IDs to digits
 * is the only defense against URL path manipulation: an id like "5/enshrine" or
 * "../Invoice/9" would otherwise redirect a routine call to a different — sometimes
 * irreversible — endpoint within the authenticated account. See the regression test
 * in src/tests/id-validation.test.ts.
 */
const NUMERIC_ID = /^\d+$/;

/** Zod schema for an `id` field on an MCP tool input. Rejects anything non-numeric. */
export const idSchema = z
  .string()
  .regex(NUMERIC_ID, "Must be a numeric sevDesk ID");

/**
 * Runtime guard for an ID used as a URL path segment. Defense in depth for callers
 * that import the exported tool functions directly and so bypass the Zod layer.
 */
export function idSegment(id: string): string {
  if (!NUMERIC_ID.test(id)) {
    // Serialize + truncate so a non-numeric value (only reachable by callers that
    // bypass the Zod layer) can't reflect quotes/newlines through handleError().
    const shown = JSON.stringify(id.length > 64 ? `${id.slice(0, 64)}…` : id);
    throw new Error(`Invalid sevDesk ID ${shown}: expected a numeric string`);
  }
  return id;
}
