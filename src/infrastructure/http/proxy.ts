import { HttpsProxyAgent } from "https-proxy-agent";

/** The explicitly configured proxy is trusted; source destinations are still validated separately. */
export function createProxyAgent(signal: AbortSignal) {
  const value = process.env.RADAR_HTTP_PROXY;
  if (!value) return undefined;

  let proxy: URL;
  let authorization: string | undefined;
  try {
    proxy = new URL(value);
    if (!["http:", "https:"].includes(proxy.protocol) || !proxy.hostname || proxy.port === "0" ||
        proxy.pathname !== "/" || proxy.search || proxy.hash) throw new Error();
    if (proxy.username || proxy.password) {
      authorization = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`;
    }
    // The agent's debug output includes its URL. Keep credentials out of that URL.
    proxy.username = "";
    proxy.password = "";
  } catch {
    throw new Error("RADAR_HTTP_PROXY must be an HTTP or HTTPS proxy URL with no path, query, or fragment.");
  }

  const lifetime = new AbortController();
  const agent = new HttpsProxyAgent(proxy, {
    keepAlive: false,
    // Agent.destroy() alone cannot close a socket still awaiting a CONNECT response.
    signal: AbortSignal.any([signal, lifetime.signal]),
    headers: authorization ? { "Proxy-Authorization": authorization } : {},
  });
  return {
    agent,
    dispose() {
      lifetime.abort();
      agent.destroy();
    },
  };
}
