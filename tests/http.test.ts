import { describe, expect, it, vi } from "vitest";
import { createPublicHttpClient, isPublicAddress, validatePublicUrl, type PublicHttpResponse, type PublicTransport } from "@/infrastructure/http/public-http";

const response = (body = "ok", status = 200, headers: Record<string, string> = {}): PublicHttpResponse => ({ url: "https://feed.example.com/", status, headers, body });
const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("public HTTP boundary", () => {
  it.each([
    "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.20.1.1", "192.168.1.2", "169.254.169.254",
    "100.64.1.1", "198.18.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1",
  ])("rejects non-public address %s", (address) => expect(isPublicAddress(address)).toBe(false));

  it.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"])("accepts public address %s", (address) => expect(isPublicAddress(address)).toBe(true));

  it.each([
    "http://2130706433/", "http://0x7f000001/", "http://127.1/", "http://[::1]/", "http://localhost/",
    "http://app.local/", "http://local.internal/", "file:///etc/passwd", "ftp://example.com/", "https://name:password@example.com/", "http://example.com:8080/",
  ])("rejects unsafe URL %s", (url) => expect(() => validatePublicUrl(url)).toThrow());

  it("rejects DNS names when any resolved address is private before opening a socket", async () => {
    const transport = vi.fn<PublicTransport>();
    const http = createPublicHttpClient({ resolver: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }], transport });
    await expect(http("https://feed.example.com/")).rejects.toThrow(/private/);
    expect(transport).not.toHaveBeenCalled();
  });

  it("passes the checked DNS addresses to the pinned transport", async () => {
    const transport = vi.fn<PublicTransport>(async () => response());
    const http = createPublicHttpClient({ resolver, transport });
    await http("https://feed.example.com/");
    expect(transport.mock.calls[0][1].addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("validates every redirect destination against DNS", async () => {
    const lookup = vi.fn(async (hostname: string) => [{ address: hostname === "private.example.com" ? "192.168.1.1" : "93.184.216.34", family: 4 }]);
    const transport = vi.fn<PublicTransport>(async () => response("", 302, { location: "https://private.example.com/" }));
    await expect(createPublicHttpClient({ resolver: lookup, transport })("https://feed.example.com/")).rejects.toThrow(/private/);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects to numeric loopback", async () => {
    const transport = vi.fn<PublicTransport>(async () => response("", 302, { location: "http://2130706433/" }));
    await expect(createPublicHttpClient({ resolver, transport })("https://feed.example.com/")).rejects.toThrow(/Private/);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("strips authentication on cross-origin redirects and keeps safe request headers", async () => {
    const transport = vi.fn<PublicTransport>()
      .mockResolvedValueOnce(response("", 302, { location: "https://other.example.com/feed" }))
      .mockResolvedValueOnce(response("feed"));
    const result = await createPublicHttpClient({ resolver, transport })("https://feed.example.com/", { headers: { Authorization: "Bearer fixture", Cookie: "session=fixture", accept: "application/xml" } });
    expect(transport.mock.calls[1][1].headers).toEqual({ accept: "application/xml" });
    expect(result.url).toBe("https://other.example.com/feed");
  });

  it("bounds redirect chains and body size", async () => {
    const redirect = vi.fn<PublicTransport>(async () => response("", 302, { location: "/again" }));
    await expect(createPublicHttpClient({ resolver, transport: redirect, maxRedirects: 1 })("https://feed.example.com/")).rejects.toThrow(/redirect limit/);
    expect(redirect).toHaveBeenCalledTimes(2);
    await expect(createPublicHttpClient({ resolver, transport: async () => response("你好"), maxBodyBytes: 5 })("https://feed.example.com/")).rejects.toThrow(/size limit/);
  });

  it("times out slow DNS resolution", async () => {
    const pending = new Promise<never>(() => {});
    await expect(createPublicHttpClient({ resolver: () => pending, timeoutMs: 20 })("https://feed.example.com/")).rejects.toThrow(/timed out/);
  });

  it("reports rate limits without copying secret response text into errors", async () => {
    await expect(createPublicHttpClient({ resolver, transport: async () => response("secret fixture", 429) })("https://feed.example.com/")).rejects.toThrow("Source request failed with HTTP 429 (rate limited).");
  });
});
