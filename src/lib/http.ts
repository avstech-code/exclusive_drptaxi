import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

/** Thrown anywhere in the API; the handler turns it into {message} with the status, like the old ApiErrors. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler so ApiError (and unexpected errors) become JSON {message} responses. */
export function api<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<unknown> | unknown,
  successStatus = 200,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      const result = await fn(req, await ctx.params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? {}, { status: successStatus });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ message: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, 'Invalid request body');
  }
}


/** Best-effort client address for rate limiting. */
export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

// Small fixed-window limiter (per server instance), so endpoints that spend Google quota cannot be hammered.
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start > windowMs) windows.delete(k);
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) windows.set(key, { start: now, count: 1 });
  else if (++w.count > limit) throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
}
