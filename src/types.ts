// --------------------------
// $fetch API
// --------------------------

import type { ParsedQuery, QueryObject } from "ufo";
import type { FetchError } from "./error";

export interface $Fetch {
  <T = any, R extends ResponseType = "json">(
    request: FetchRequest,
    options?: FetchOptions<R>
  ): Promise<MappedResponseType<R, T>>;
  raw<T = any, R extends ResponseType = "json">(
    request: FetchRequest,
    options?: FetchOptions<R>
  ): Promise<FetchResponse<MappedResponseType<R, T>>>;
  native: Fetch;
  create(
    defaults: FetchOptions,
    options?: Omit<CreateFetchOptions, "defaults">
  ): $Fetch;
}

// --------------------------
// Context
// --------------------------

export interface FetchContext<T = any, R extends ResponseType = ResponseType> {
  $self: $Fetch["raw"];

  request: FetchRequest;

  options: FetchOptions<R>;
  response?: FetchResponse<T>;
  error?: Error;
}

// --------------------------
// Options
// --------------------------

export type FetchHookNext = () => Promise<void>;

export interface FetchHooks<R extends ResponseType = ResponseType> {
  onRequest?(context: FetchContext, next: FetchHookNext): Promise<void> | void;
  onRequestError?(
    context: FetchContext & { error: Error },
    next: FetchHookNext
  ): Promise<void> | void;
  onResponse?(
    context: FetchContext & { response: FetchResponse<R> },
    next: FetchHookNext
  ): Promise<void> | void;
  onResponseError?(
    context: FetchContext & { response: FetchResponse<R> },
    next: FetchHookNext
  ): Promise<void> | void;
}

export interface WithQueryOptions {
  stringifyQuery?(query: QueryObject): string;
  parseQuery?(parametersString?: string): ParsedQuery;
}

export interface FetchOptions<R extends ResponseType = ResponseType>
  extends Omit<RequestInit, "body">,
    FetchHooks<R>,
    WithQueryOptions {
  baseURL?: string;
  body?: RequestInit["body"] | Record<string, any>;
  ignoreResponseError?: boolean;
  params?: Record<string, any>;
  query?: Record<string, any>;
  parseResponse?: (
    context: FetchContext & { response: FetchResponse<R> }
  ) => Promise<any>;
  responseType?: R;

  /**
   * @experimental Set to "half" to enable duplex streaming.
   * Will be automatically set to "half" when using a ReadableStream as body.
   * https://fetch.spec.whatwg.org/#enumdef-requestduplex
   */
  duplex?: "half" | undefined;

  /** timeout in milliseconds */
  timeout?: number;

  retry?: number | false;
  /** Delay between retries in milliseconds. */
  retryDelay?: number | ((context: FetchContext) => number);
  /** Default is [408, 409, 425, 429, 500, 502, 503, 504] */
  retryStatusCodes?: number[];

  hasBody?(
    context: FetchContext & { response: FetchResponse<R> }
  ): Promise<boolean> | boolean;
  createFetchError?(context: FetchContext): FetchError;
}

export interface CreateFetchOptions {
  defaults?: FetchOptions;
  fetch?: Fetch;
  Headers?: typeof Headers;
  AbortController?: typeof AbortController;
}

export type GlobalOptions = Pick<
  FetchOptions,
  "timeout" | "retry" | "retryDelay"
>;

// --------------------------
// Response Types
// --------------------------

export interface ResponseMap {
  blob: Blob;
  text: string;
  arrayBuffer: ArrayBuffer;
  stream: ReadableStream<Uint8Array>;
}

export type ResponseType = keyof ResponseMap | "json";

export type MappedResponseType<
  R extends ResponseType,
  JsonType = any,
> = R extends keyof ResponseMap ? ResponseMap[R] : JsonType;

export interface FetchResponse<T> extends Response {
  _data?: T;
}

// --------------------------
// Error
// --------------------------

export interface IFetchError<T = any> extends Error {
  request?: FetchRequest;
  options?: FetchOptions;
  response?: FetchResponse<T>;
  data?: T;
  status?: number;
  statusText?: string;
  statusCode?: number;
  statusMessage?: string;
}

// --------------------------
// Other types
// --------------------------

export type Fetch = typeof globalThis.fetch;

export type FetchRequest = RequestInfo;

export interface SearchParameters {
  [key: string]: any;
}
