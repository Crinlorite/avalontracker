import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_MEMBER"
  | "INSUFFICIENT_ROLE"
  | "CONFLICT"
  | "STALE_DEPENDENCY"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INTERNAL";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    [extra: string]: unknown;
  };
};

export function apiError(
  code: ApiErrorCode,
  status: number,
  message: string,
  extra?: Record<string, unknown>
): NextResponse<ApiErrorBody> {
  const requestId = `req_${crypto.randomBytes(6).toString("hex")}`;
  return NextResponse.json(
    { error: { code, message, requestId, ...extra } },
    { status }
  );
}

export function internalError(err: unknown): NextResponse<ApiErrorBody> {
  const requestId = `req_${crypto.randomBytes(6).toString("hex")}`;
  logger.error({ err, requestId }, "unhandled api error");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Error interno", requestId } },
    { status: 500 }
  );
}
