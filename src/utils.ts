import type {
  FetchContext,
  FetchHook,
  FetchHookNext,
  FetchHooks,
  FetchOptions,
  FetchRequest,
  MaybeArray,
  ResolvedFetchOptions,
  ResponseType,
} from "./types.ts";

const payloadMethods = new Set(
  Object.freeze(["PATCH", "POST", "PUT", "DELETE"])
);
export function isPayloadMethod(method = "GET"): boolean {
  return payloadMethods.has(method.toUpperCase());
}

export function isJSONSerializable(value: any): boolean {
  if (value === undefined) {
    return false;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === null) {
    return true;
  }
  if (t !== "object") {
    return false; // bigint, function, symbol, undefined
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (value.buffer) {
    return false;
  }
  // `FormData` and `URLSearchParams` shouldn't have a `toJSON` method,
  // but Bun adds it, which is non-standard.
  if (value instanceof FormData || value instanceof URLSearchParams) {
    return false;
  }
  return (
    (value.constructor && value.constructor.name === "Object") ||
    typeof value.toJSON === "function"
  );
}

const textTypes = new Set([
  "image/svg",
  "application/xml",
  "application/xhtml",
  "application/html",
]);

const JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(;.+)?$/i;

// This provides reasonable defaults for the correct parser based on Content-Type header.
export function detectResponseType(_contentType = ""): ResponseType {
  if (!_contentType) {
    return "json";
  }

  // Value might look like: `application/json; charset=utf-8`
  const contentType = _contentType.split(";").shift() || "";

  if (JSON_RE.test(contentType)) {
    return "json";
  }

  // TODO
  // if (contentType === 'application/octet-stream') {
  //   return 'stream'
  // }

  // SSE
  // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#sending_events_from_the_server
  if (contentType === "text/event-stream") {
    return "stream";
  }

  if (textTypes.has(contentType) || contentType.startsWith("text/")) {
    return "text";
  }

  return "blob";
}

export const FETCH_HOOKS: ReadonlyArray<keyof FetchHooks> = [
  "onRequest",
  "onRequestError",
  "onResponse",
  "onResponseError",
];

export async function noop(): Promise<void> {
  // noop
}

/**
 * Merges `input` and `defaults` hooks into a single chain: `input` runs first
 * and decides whether `defaults` runs by calling its `next`.
 *
 * Inside an array, every hook runs in order even if one does not call `next`.
 */
function composeHooks(
  input: MaybeArray<FetchHook> | undefined,
  defaults: MaybeArray<FetchHook> | undefined
): FetchHook | undefined {
  if (!input && !defaults) {
    return undefined;
  }

  return (context, next = noop) =>
    runHookLayer(input, context, () => runHookLayer(defaults, context, next));
}

async function runHookLayer(
  layer: MaybeArray<FetchHook> | undefined,
  context: FetchContext,
  next: FetchHookNext
): Promise<void> {
  if (!layer) {
    return next();
  }

  if (!Array.isArray(layer)) {
    return layer(context, next);
  }

  return runHookList(layer, 0, context, next);
}

async function runHookList(
  list: FetchHook[],
  index: number,
  context: FetchContext,
  next: FetchHookNext
): Promise<void> {
  if (index >= list.length) {
    return next();
  }

  let advanced = false;
  const proceed = async (): Promise<void> => {
    if (advanced) {
      return;
    }
    advanced = true;
    await runHookList(list, index + 1, context, next);
  };

  await list[index](context, proceed);
  await proceed();
}

// Merging of fetch option objects.
export function mergeFetchOptions(
  input: FetchOptions | undefined,
  defaults: FetchOptions | undefined,
  Headers = globalThis.Headers
): FetchOptions {
  const merged: FetchOptions = {
    ...defaults,
    ...input,
  };

  // Merge params and query
  if (defaults?.params && input?.params) {
    merged.params = {
      ...defaults.params,
      ...input.params,
    };
  }
  if (defaults?.query && input?.query) {
    merged.query = {
      ...defaults.query,
      ...input.query,
    };
  }

  // Merge headers
  if (defaults?.headers && input?.headers) {
    merged.headers = new Headers(defaults.headers || {});
    for (const [key, value] of new Headers(input.headers || {})) {
      merged.headers.set(key, value);
    }
  }

  for (const name of FETCH_HOOKS) {
    const hook = composeHooks(input?.[name], defaults?.[name]);
    if (hook) {
      (merged as any)[name] = hook;
    } else {
      delete (merged as any)[name];
    }
  }

  return merged;
}

export function resolveFetchOptions<
  R extends ResponseType = ResponseType,
  T = any,
>(
  request: FetchRequest,
  input: FetchOptions<R, T> | undefined,
  defaults: FetchOptions<R, T> | undefined,
  Headers: typeof globalThis.Headers
): ResolvedFetchOptions<R, T> {
  // Merge headers
  const headers = mergeHeaders(
    input?.headers ?? (request as Request)?.headers,
    defaults?.headers,
    Headers
  );

  // Merge query/params
  let query: Record<string, any> | undefined;
  if (defaults?.query || defaults?.params || input?.params || input?.query) {
    query = {
      ...defaults?.params,
      ...defaults?.query,
      ...input?.params,
      ...input?.query,
    };
  }

  const resolved: ResolvedFetchOptions<R, T> = {
    ...defaults,
    ...input,
    query,
    params: query,
    headers,
  };

  for (const name of FETCH_HOOKS) {
    const hook = composeHooks(input?.[name], defaults?.[name]);
    if (hook) {
      (resolved as any)[name] = hook;
    } else {
      delete (resolved as any)[name];
    }
  }

  return resolved;
}

function mergeHeaders(
  input: HeadersInit | undefined,
  defaults: HeadersInit | undefined,
  Headers: typeof globalThis.Headers
): Headers {
  if (!defaults) {
    return new Headers(input);
  }
  const headers = new Headers(defaults);
  if (input) {
    for (const [key, value] of Symbol.iterator in input || Array.isArray(input)
      ? input
      : new Headers(input)) {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function callHooks<C extends FetchContext = FetchContext>(
  context: C,
  hooks: MaybeArray<FetchHook<C>> | undefined
): Promise<void> {
  await runHookLayer(hooks as MaybeArray<FetchHook>, context, noop);
}
