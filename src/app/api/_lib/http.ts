// Small helpers shared by the /api route handlers (private folder: not a route).

import { z } from "zod";
import type { ApiError } from "@/shared/api";

export function createErrorResponse(
  status: number,
  error: string,
  issues?: unknown,
): Response {
  const body: ApiError = issues === undefined ? { error } : { error, issues };
  return Response.json(body, { status });
}

export function createNotFoundResponse(what = "Recurso"): Response {
  return createErrorResponse(404, `${what} não encontrado`);
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Parses a JSON body with a zod schema; on failure returns a 400 response. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<ParseResult<z.output<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: createErrorResponse(400, "JSON inválido") };
  }
  return parseValue(raw, schema);
}

/** Validates any value with a zod schema; on failure returns a 400 response. */
export function parseValue<T extends z.ZodType>(
  raw: unknown,
  schema: T,
): ParseResult<z.output<T>> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: createErrorResponse(
      400,
      "Dados inválidos",
      z.treeifyError(result.error),
    ),
  };
}

/** True for lowercase canonical UUIDs (avoids DB errors on bad ids). */
export function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}
