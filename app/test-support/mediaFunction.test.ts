// functions/media/[id].ts: stored files served from our own domain, cached
// at the edge, with the "not training data" headers. (The test lives here
// because any file under functions/ becomes a route.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/media/[id]";

const KEY = "2f8a1c3e-7b4d-4e2a-9f10-5c6d7e8f9a0b";

function context(path: string, init: RequestInit = {}) {
  const waits: Promise<unknown>[] = [];
  return {
    waits,
    ctx: {
      request: new Request(`https://thecreative.exchange${path}`, init),
      env: { CONVEX_URL: "https://convex.test" },
      params: { id: path.split("/").pop() },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
  };
}

function fakeCache() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => void store.set(req.url, res)),
  };
  vi.stubGlobal("caches", { default: cache });
  return cache;
}

function origin(status = 200, headers: Record<string, string> = { "content-type": "image/jpeg" }) {
  return vi.fn(async () => new Response(status === 200 || status === 206 ? "bytes" : null, { status, headers }));
}

afterEach(() => vi.unstubAllGlobals());

describe("media function", () => {
  it("fetches from Convex on a miss, sends our headers, and caches for a day", async () => {
    const cache = fakeCache();
    const fetchMock = origin();
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, waits } = context(`/media/${KEY}`);

    const res = await onRequest(ctx);
    await Promise.all(waits);

    expect(fetchMock).toHaveBeenCalledWith(`https://convex.test/api/storage/${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-robots-tag")).toBe("noai, noimageai");
    expect(res.headers.get("tdm-reservation")).toBe("1");
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("serves a cached file without asking Convex", async () => {
    fakeCache();
    vi.stubGlobal("fetch", origin());
    const first = context(`/media/${KEY}`);
    await onRequest(first.ctx);
    await Promise.all(first.waits);

    const fetchMock = origin();
    vi.stubGlobal("fetch", fetchMock);
    const res = await onRequest(context(`/media/${KEY}`).ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes");
  });

  it("passes Range requests straight through, uncached", async () => {
    const cache = fakeCache();
    const fetchMock = origin(206, { "content-type": "video/mp4", "content-range": "bytes 0-4/100" });
    vi.stubGlobal("fetch", fetchMock);

    const res = await onRequest(context(`/media/${KEY}`, { headers: { range: "bytes=0-4" } }).ctx);

    expect(fetchMock).toHaveBeenCalledWith(`https://convex.test/api/storage/${KEY}`, { headers: { range: "bytes=0-4" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-4/100");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("answers 404 for a deleted file and for a key that isn't one", async () => {
    fakeCache();
    vi.stubGlobal("fetch", origin(404));
    expect((await onRequest(context(`/media/${KEY}`).ctx)).status).toBe(404);
    expect((await onRequest(context("/media/..%2Fsecret").ctx)).status).toBe(404);
  });

  it("refuses anything but GET and HEAD", async () => {
    fakeCache();
    const res = await onRequest(context(`/media/${KEY}`, { method: "POST" }).ctx);
    expect(res.status).toBe(405);
  });

  it("works where there is no edge cache", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", origin());
    const res = await onRequest(context(`/media/${KEY}`).ctx);
    expect(res.status).toBe(200);
  });
});
