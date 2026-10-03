import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type RequestListener } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { createSecureContext, TLSSocket } from "node:tls";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicHttpClient } from "@/infrastructure/http/public-http";
import { createProxyAgent } from "@/infrastructure/http/proxy";

// Public test fixture only, valid 2020–2120; never used outside the local fake proxy.
const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg6d4qoCRbQ2wqozkf
XLC0hQ7BFtlcXMRBl9fgD/lVWVKhRANCAATFZkKLl6ke4/FsPF3ao0VZ/Jq4dbYS
/J3czY5LKBp8vzMRxvCRP5VcoAKrjt+SHicLCJyTE9CujKMpODCo+9Ym
-----END PRIVATE KEY-----`;
const cert = `-----BEGIN CERTIFICATE-----
MIIBiTCCAS+gAwIBAgIIDX0a0/xavXQwCgYIKoZIzj0EAwIwGzEZMBcGA1UEAxMQ
ZmVlZC5leGFtcGxlLmNvbTAgFw0yMDAxMDEwMDAwMDBaGA8yMTIwMDEwMTAwMDAw
MFowGzEZMBcGA1UEAxMQZmVlZC5leGFtcGxlLmNvbTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABMVmQouXqR7j8Ww8XdqjRVn8mrh1thL8ndzNjksoGny/MxHG8JE/
lVygAquO35IeJwsInJMT0K6Moyk4MKj71iajWzBZMEYGA1UdEQQ/MD2CEGZlZWQu
ZXhhbXBsZS5jb22CEW90aGVyLmV4YW1wbGUuY29thwRduNgihxAmBkcARwAAAAAA
AAAAABERMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgPLLbUisJ
CvPdJ2r/smSv7v9/UTJJMno7ZWBvNhG8MZQCIQDVIxhwqUGQ0M+9piIgIoHBQGB2
PzM4D3r6NxR2Uf0Kfg==
-----END CERTIFICATE-----`;

const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const close of cleanup.splice(0)) await close();
});

function trustFixture() {
  const connect = HttpsProxyAgent.prototype.connect;
  // Add a test CA only. CONNECT, TLS, SNI, and certificate identity checks remain real.
  vi.spyOn(HttpsProxyAgent.prototype, "connect").mockImplementation(function (this: HttpsProxyAgent<string>, request, options) {
    return connect.call(this, request, { ...options, ca: cert });
  });
}

async function fakeProxy(
  handler: RequestListener = (_request, response) => response.end("feed"),
  mode: "http" | "tls" | "connect-stall" | "tls-stall" = "http",
) {
  const connects: { destination: string | undefined; headers: IncomingHttpHeaders }[] = [];
  const requests: { url: string | undefined; headers: IncomingHttpHeaders }[] = [];
  const servernames: string[] = [];
  const sockets = new Set<Socket>();
  const origin = createServer((request, response) => {
    requests.push({ url: request.url, headers: request.headers });
    handler(request, response);
  });
  const proxy = createServer();
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("end", () => socket.end());
    socket.on("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, socket, head) => {
    connects.push({ destination: request.url, headers: request.headers });
    if (mode === "connect-stall") { socket.resume(); return; }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) socket.unshift(head);
    if (mode === "tls-stall") { socket.resume(); return; }
    if (mode === "tls") {
      const secureContext = createSecureContext({ key, cert });
      const secureSocket = new TLSSocket(socket, {
        isServer: true, secureContext,
        SNICallback: (servername, callback) => {
          servernames.push(servername);
          callback(null, secureContext);
        },
      });
      secureSocket.on("error", () => {});
      origin.emit("connection", secureSocket);
    } else {
      origin.emit("connection", socket);
    }
  });
  const listening = once(proxy, "listening");
  proxy.listen(0, "127.0.0.1");
  await listening;
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    origin.close();
  });
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  vi.stubEnv("RADAR_HTTP_PROXY", url);
  return { url, connects, requests, servernames, sockets };
}

describe("explicit public HTTP proxy", () => {
  it.each([[undefined, 15_000], ["1000", 1_000], ["45000", 45_000], ["120000", 120_000]] as const)("uses bounded timeout setting %s", async (value, expected) => {
    vi.stubEnv("RADAR_HTTP_TIMEOUT_MS", value);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await createPublicHttpClient({ resolver, transport: async () => ({ url: "http://feed.example.com/", status: 200, headers: {}, body: "feed" }) })("http://feed.example.com/");
    expect(timeout).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it.each(["999", "120001", "NaN", "45000ms", "1500.5"])("rejects invalid timeout setting %s while preserving explicit config precedence", (value) => {
    vi.stubEnv("RADAR_HTTP_TIMEOUT_MS", value);
    expect(() => createPublicHttpClient()).toThrow("RADAR_HTTP_TIMEOUT_MS must be an integer from 1000 to 120000.");
    expect(() => createPublicHttpClient({ timeoutMs: 20 })).not.toThrow();
  });

  it("does not enable a proxy from ambient HTTP(S)_PROXY variables", () => {
    vi.stubEnv("RADAR_HTTP_PROXY", undefined);
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:1");
    vi.stubEnv("HTTP_PROXY", "http://127.0.0.1:1");
    expect(createProxyAgent(new AbortController().signal)).toBeUndefined();
  });

  it.each([
    "not a proxy", "   ", "socks5://127.0.0.1:17891", "file:///proxy",
    "http://127.0.0.1:0", "http://127.0.0.1:99999", "http://127.0.0.1/path",
    "http://127.0.0.1/?secret=fixture", "http://127.0.0.1/#fixture",
    "http://name:%ZZ@127.0.0.1", "http://name:super-secret@127.0.0.1/path",
  ])("rejects invalid proxy configuration without echoing it: %s", async (value) => {
    vi.stubEnv("RADAR_HTTP_PROXY", value);
    await expect(createPublicHttpClient({ resolver })("http://feed.example.com/"))
      .rejects.toThrow(/^RADAR_HTTP_PROXY must be an HTTP or HTTPS proxy URL with no path, query, or fragment\.$/);
  });

  it("CONNECTs to the pinned public IP and preserves HTTP Host and path", async () => {
    const proxy = await fakeProxy();
    const destroy = vi.spyOn(HttpsProxyAgent.prototype, "destroy");
    const lookup = vi.fn(resolver);
    const result = await createPublicHttpClient({ resolver: lookup })("http://feed.example.com/feed?q=1", {
      headers: { Host: "wrong.example.com", host: "also-wrong.example.com", accept: "application/xml" },
    });
    expect(result.body).toBe("feed");
    expect(result.url).toBe("http://feed.example.com/feed?q=1");
    expect(lookup).toHaveBeenCalledExactlyOnceWith("feed.example.com");
    expect(proxy.connects[0].destination).toBe("93.184.216.34:80");
    expect(proxy.connects[0].headers.host).toBe("93.184.216.34:80");
    expect(proxy.requests).toEqual([{ url: "/feed?q=1", headers: expect.objectContaining({
      host: "feed.example.com", accept: "application/xml", "accept-encoding": "identity",
    }) }]);
    expect(destroy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
  });

  it("preserves HTTPS SNI, certificate hostname verification, and Host", async () => {
    trustFixture();
    const proxy = await fakeProxy(undefined, "tls");
    const client = createPublicHttpClient({ resolver });
    await expect(client("https://feed.example.com/feed")).resolves.toMatchObject({ body: "feed" });
    expect(proxy.connects[0].destination).toBe("93.184.216.34:443");
    expect(proxy.servernames).toEqual(["feed.example.com"]);
    expect(proxy.requests[0].headers.host).toBe("feed.example.com");
    await expect(client("https://wrong.example.com/")).rejects.toThrow(/Hostname\/IP does not match/);
    expect(proxy.requests).toHaveLength(1);
    await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
  });

  it("rejects an untrusted TLS certificate", async () => {
    const proxy = await fakeProxy(undefined, "tls");
    await expect(createPublicHttpClient({ resolver })("https://feed.example.com/"))
      .rejects.toThrow(/self-signed certificate/);
    expect(proxy.requests).toHaveLength(0);
    await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
  });

  it.each([
    { host: "93.184.216.34", address: "93.184.216.34", family: 4, destination: "93.184.216.34:443", servernames: [] },
    { host: "feed.example.com", address: "2606:4700:4700::1111", family: 6, destination: "[2606:4700:4700::1111]:443", servernames: ["feed.example.com"] },
  ])("pins HTTPS address $address and verifies the original host $host", async ({ host, address, family, destination, servernames }) => {
    trustFixture();
    const proxy = await fakeProxy(undefined, "tls");
    await expect(createPublicHttpClient({ resolver: async () => [{ address, family }] })(`https://${host}/`)).resolves.toMatchObject({ body: "feed" });
    expect(proxy.connects[0].destination).toBe(destination);
    expect(proxy.requests[0].headers.host).toBe(host);
    expect(proxy.servernames).toEqual(servernames);
  });

  it("sends proxy credentials only in CONNECT and creates a fresh agent for every redirect", async () => {
    const proxy = await fakeProxy((request, response) => {
      if (request.headers.host === "feed.example.com") {
        response.writeHead(302, { location: "http://other.example.com/feed" });
      }
      response.end("feed");
    });
    vi.stubEnv("RADAR_HTTP_PROXY", proxy.url.replace("http://", "http://user:p%40ss@"));
    const connect = vi.spyOn(HttpsProxyAgent.prototype, "connect");
    const destroy = vi.spyOn(HttpsProxyAgent.prototype, "destroy");
    const lookup = vi.fn(async (hostname: string) => [{
      address: hostname === "feed.example.com" ? "93.184.216.34" : "1.1.1.1", family: 4,
    }]);
    await createPublicHttpClient({ resolver: lookup })("http://feed.example.com/", {
      headers: { Authorization: "Bearer fixture", Cookie: "session=fixture", "Proxy-Authorization": "origin-fixture", accept: "application/xml" },
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(proxy.connects.map((entry) => entry.destination)).toEqual(["93.184.216.34:80", "1.1.1.1:80"]);
    for (const tunnel of proxy.connects) {
      expect(tunnel.headers["proxy-authorization"]).toBe(`Basic ${Buffer.from("user:p@ss").toString("base64")}`);
      expect(tunnel.headers.authorization).toBeUndefined();
      expect(tunnel.headers.cookie).toBeUndefined();
    }
    expect(proxy.requests[0].headers.authorization).toBe("Bearer fixture");
    expect(proxy.requests[0].headers["proxy-authorization"]).toBe("origin-fixture");
    expect(proxy.requests[1].headers).toMatchObject({ host: "other.example.com", accept: "application/xml" });
    for (const header of ["authorization", "cookie", "proxy-authorization"]) {
      expect(proxy.requests[1].headers[header]).toBeUndefined();
    }
    expect(connect.mock.contexts[0]).not.toBe(connect.mock.contexts[1]);
    expect(destroy).toHaveBeenCalledTimes(2);
    expect((connect.mock.contexts[0] as HttpsProxyAgent<string>).proxy.href).toBe(`${proxy.url}/`);
    await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
  });

  it("rejects mixed public/private DNS answers before CONNECT", async () => {
    const proxy = await fakeProxy();
    await expect(createPublicHttpClient({ resolver: async () => [
      { address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 },
    ] })("http://feed.example.com/")).rejects.toThrow(/private/);
    expect(proxy.connects).toHaveLength(0);
  });

  it.each(["http://127.0.0.1/", "http://private.example.com/"])("blocks unsafe redirect %s before a second CONNECT", async (location) => {
    const proxy = await fakeProxy((_request, response) => {
      response.writeHead(302, { location });
      response.end();
    });
    const lookup = async (hostname: string) => [{ address: hostname === "private.example.com" ? "10.0.0.1" : "93.184.216.34", family: 4 }];
    await expect(createPublicHttpClient({ resolver: lookup })("http://feed.example.com/")).rejects.toThrow(/private/i);
    expect(proxy.connects).toHaveLength(1);
  });

  it.each(["declared", "streamed"])("bounds %s body size and closes the tunnel", async (kind) => {
    const proxy = await fakeProxy((_request, response) => {
      if (kind === "declared") response.setHeader("content-length", "20");
      response.write("123456");
    });
    const destroy = vi.spyOn(HttpsProxyAgent.prototype, "destroy");
    await expect(createPublicHttpClient({ resolver, maxBodyBytes: 5 })("http://feed.example.com/"))
      .rejects.toThrow(/size limit/);
    expect(destroy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
  });

  it.each(["connect-stall", "tls-stall", "body-stall"] as const)("times out and closes sockets during %s", async (phase) => {
    const proxy = await fakeProxy((_request, response) => { response.write("partial"); }, phase === "body-stall" ? "http" : phase);
    const destroy = vi.spyOn(HttpsProxyAgent.prototype, "destroy");
    const protocol = phase === "tls-stall" ? "https" : "http";
    await expect(createPublicHttpClient({ resolver, timeoutMs: 150 })(`${protocol}://feed.example.com/`))
      .rejects.toThrow(/timed out/);
    expect(proxy.connects).toHaveLength(1);
    await vi.waitFor(() => {
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(proxy.sockets.size).toBe(0);
    });
  });
});
