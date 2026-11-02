/* eslint-disable unicorn/prefer-at */
export type QueryValue =
  | string
  | number
  | boolean
  | QueryValue[]
  | Record<string, any>
  | null
  | undefined;
export type QueryObject = Record<string, QueryValue | QueryValue[]>;

export interface WithQueryOptions {
  stringifyQuery?(query: QueryObject): string;
  parseQuery?(parametersString?: string): Record<string, any>;
}

/**
 * Joins the given base URL and path, ensuring that there is only one slash between them.
 */
export function joinURL(base?: string, path?: string): string {
  if (!base || base === "/") {
    return path || "/";
  }

  if (!path || path === "/") {
    return base || "/";
  }

  const baseHasTrailing = base[base.length - 1] === "/";
  const pathHasLeading = path[0] === "/";
  if (baseHasTrailing && pathHasLeading) {
    return base + path.slice(1);
  }

  if (!baseHasTrailing && !pathHasLeading) {
    return `${base}/${path}`;
  }

  return base + path;
}

/**
 * Adds the base path to the input path, if it is not already present.
 */
export function withBase(input = "", base = ""): string {
  if (!base || base === "/") {
    return input;
  }

  const _base = withoutTrailingSlash(base);
  if (input.startsWith(_base)) {
    return input;
  }

  return joinURL(_base, input);
}

function withoutTrailingSlash(path?: string): string {
  if (!path || path === "/") {
    return "/";
  }

  return path[path.length - 1] === "/" ? path.slice(0, -1) : path;
}

/**
 * Returns the URL with the given query parameters. If a query parameter is undefined, it is omitted.
 */
export function withQuery(
  input: string,
  query?: QueryObject,
  {
    stringifyQuery = defaultStringifyQuery,
    parseQuery = defaultParseQuery,
  }: WithQueryOptions = {}
): string {
  if (!query || Object.keys(query).length === 0) {
    return input;
  }

  const hashIndex = input.indexOf("#");
  const hash = hashIndex === -1 ? "" : input.slice(hashIndex);
  const rest = hashIndex === -1 ? input : input.slice(0, hashIndex);
  const searchIndex = rest.indexOf("?");
  const path = searchIndex === -1 ? rest : rest.slice(0, searchIndex);
  const search = searchIndex === -1 ? undefined : rest.slice(searchIndex + 1);

  const queryString = stringifyQuery({ ...parseQuery(search), ...query });
  return `${path}${queryString ? `?${queryString}` : ""}${hash}`;
}

function defaultParseQuery(search?: string): Record<string, any> {
  const parsed: Record<string, any> = {};
  if (!search) {
    return parsed;
  }

  for (const [key, value] of new URLSearchParams(search)) {
    if (key in parsed) {
      parsed[key] = Array.isArray(parsed[key])
        ? [...parsed[key], value]
        : [parsed[key], value];
    } else {
      parsed[key] = value;
    }
  }

  return parsed;
}

function defaultStringifyQuery(query: QueryObject): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined) {
        continue;
      }
      searchParams.append(key, normalizeQueryValue(item));
    }
  }

  return searchParams.toString();
}

function normalizeQueryValue(value: QueryValue): string {
  if (value === null) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
