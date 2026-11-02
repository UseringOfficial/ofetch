import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { $fetch } from "../src/index.ts";

describe("response body timeout", () => {
  let server: Server;
  let url: string;
  const requests = new Map<string, number>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url!;
      const count = (requests.get(path) || 0) + 1;
      requests.set(path, count);
      res.setHeader("Content-Type", "text/plain");
      if (!path.startsWith("/retry-headers")) {
        res.flushHeaders();
      }
      const delay = path.includes("retry") && count > 1 ? 0 : 300;
      const timer = setTimeout(() => res.end("complete"), delay);
      res.on("close", () => clearTimeout(timer));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it.each([undefined, "headers"] as const)(
    "preserves slow body reads with timeoutUntil=%s",
    async (timeoutUntil) => {
      expect(
        await $fetch(`${url}/compatible-${timeoutUntil}`, {
          timeout: 100,
          timeoutUntil,
          retry: 0,
        })
      ).toBe("complete");
    }
  );

  it("allows a per-request override of a body-timeout default", async () => {
    const fetchBody = $fetch.create({
      timeout: 100,
      timeoutUntil: "body",
      retry: 0,
    });
    await expect(fetchBody(`${url}/default-body`)).rejects.toThrow("timeout");
    expect(
      await fetchBody(`${url}/override-headers`, { timeoutUntil: "headers" })
    ).toBe("complete");
  });

  it("uses 408 to retry body timeouts even when the server sent 200", async () => {
    const path = "/retry-body-408";
    expect(
      await $fetch(url + path, {
        timeout: 100,
        timeoutUntil: "body",
        retry: 1,
        retryStatusCodes: [408],
      })
    ).toBe("complete");
    expect(requests.get(path)).toBe(2);
  });

  it("keeps the existing retry status classification for header timeouts", async () => {
    const path = "/retry-headers-500";
    expect(
      await $fetch(url + path, {
        timeout: 100,
        retry: 1,
        retryStatusCodes: [500],
      })
    ).toBe("complete");
    expect(requests.get(path)).toBe(2);
  });

  it.each(["blob", "text", "arrayBuffer", "json"] as const)(
    "aborts stalled %s bodies after receiving headers",
    async (responseType) => {
      await expect(
        $fetch(`${url}/${responseType}`, {
          responseType,
          timeout: 100,
          timeoutUntil: "body",
          retry: 0,
        })
      ).rejects.toThrow("The operation was aborted due to timeout");
    }
  );

  it("keeps the timeout while a custom parser reads the body", async () => {
    await expect(
      $fetch(`${url}/custom`, {
        timeout: 100,
        timeoutUntil: "body",
        retry: 0,
        parseResponse: (context) => context.response.text(),
      })
    ).rejects.toThrow("The operation was aborted due to timeout");
  });

  it.each(["headers", "body"])(
    "retries a %s timeout with a fresh signal",
    async (phase) => {
      const path = `/retry-${phase}`;
      expect(
        await $fetch(url + path, {
          timeout: 100,
          timeoutUntil: "body",
          retry: 1,
        })
      ).toBe("complete");
      expect(requests.get(path)).toBe(2);
    }
  );

  it("leaves the returned stream's lifetime to its caller", async () => {
    const body = await $fetch<ReadableStream>(`${url}/stream`, {
      timeout: 100,
      timeoutUntil: "body",
      retry: 0,
      responseType: "stream",
    });
    expect(await new Response(body).text()).toBe("complete");
  });

  it("preserves caller cancellation while reading a body", async () => {
    const controller = new AbortController();
    const pending = $fetch(`${url}/caller-abort`, {
      signal: controller.signal,
      retry: 2,
    });
    const check = expect(pending).rejects.toThrow(/abort/i);
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await check;
      expect(requests.get("/caller-abort")).toBe(1);
    } finally {
      clearTimeout(timer);
    }
  });
});
