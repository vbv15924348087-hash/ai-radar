import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { createProxyAgent } from "./proxy";

export interface ResolvedAddress { address: string; family: number }
export interface PublicHttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface PublicRequestOptions { headers?: Record<string, string> }
export type PublicHttpClient = (url: string, options?: PublicRequestOptions) => Promise<PublicHttpResponse>;
export type PublicResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export interface TransportOptions {
  addresses: ResolvedAddress[];
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBodyBytes: number;
}
export type PublicTransport = (url: URL, options: TransportOptions) => Promise<PublicHttpResponse>;

function ipv6Words(address: string): number[] {
  const halves = address.toLowerCase().split("::");
  const left = halves[0] ? halves[0].split(":").map((word) => parseInt(word, 16)) : [];
  const right = halves[1] ? halves[1].split(":").map((word) => parseInt(word, 16)) : [];
  return halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left;
}

/** Conservative public Internet allowlist. Transition and special-use ranges are excluded. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family === 6 && !address.includes(".")) {
    const [a, b] = ipv6Words(address);
    return a >= 0x2000 && a <= 0x3fff &&
      !(a === 0x2001 && (b < 0x0200 || b === 0x0db8)) &&
      a !== 0x2002 && !(a === 0x3fff && b <= 0x0fff);
  }
  return false;
}

export function validatePublicUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Source URL must be an absolute HTTP or HTTPS URL."); }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed.");
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) {
    throw new Error("Only the standard HTTP and HTTPS ports are allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || /\.(localhost|local|internal|home|lan|test|invalid)$/.test(hostname) ||
      hostname === "metadata.google.internal" || (!isIP(hostname) && !hostname.includes("."))) {
    throw new Error("Local and internal network hosts are not allowed.");
  }
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new Error("Private or reserved IP addresses are not allowed.");
  url.hash = "";
  return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error("Source request timed out."));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

const nodeTransport: PublicTransport = (url, options) => {
  const proxy = createProxyAgent(options.signal);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const headers: Record<string, string> = { "user-agent": "AI-Radar/0.1 (+local feed reader)", "accept-encoding": "identity", ...options.headers };
  if (proxy) {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === "host") delete headers[key];
    headers.host = url.host;
  }
  return new Promise<PublicHttpResponse>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(url, {
      method: "GET", agent: proxy?.agent ?? false, signal: options.signal, maxHeaderSize: 16_384,
      headers,
      // CONNECT must use a checked IP: proxy agents do not use the request's lookup hook.
      ...(proxy ? {
        hostname: options.addresses[0].address,
        servername: isIP(hostname) ? "" : hostname,
        rejectUnauthorized: true,
        checkServerIdentity: (_name, certificate) => checkServerIdentity(hostname, certificate),
      } : {}),
      // Pin the already-validated DNS result to this connection. The hostname remains intact for TLS/SNI.
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, options.addresses);
        else callback(null, options.addresses[0].address, options.addresses[0].family);
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      if (Number(response.headers["content-length"]) > options.maxBodyBytes) {
        response.destroy(new Error("Source response exceeded the size limit."));
      }
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > options.maxBodyBytes) {
          response.destroy(new Error("Source response exceeded the size limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
        }
        if (headers["content-encoding"] && headers["content-encoding"] !== "identity") {
          reject(new Error("Source ignored the identity encoding request; compressed bodies are unsupported."));
          return;
        }
        resolve({ url: url.href, status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    request.on("error", reject);
    request.end();
  }).finally(() => proxy?.dispose());
};

/** Explicit opt-in for networks whose system resolver returns synthetic proxy addresses. */
export const cloudflareDnsResolver: PublicResolver = async (hostname) => {
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const url = new URL("https://1.1.1.1/dns-query");
    url.search = new URLSearchParams({ name: hostname, type }).toString();
    const signal = AbortSignal.timeout(5_000);
    const response = await abortable(nodeTransport(url, {
      addresses: [{ address: "1.1.1.1", family: 4 }], headers: { accept: "application/dns-json" },
      signal, maxBodyBytes: 65_536,
    }), signal);
    if (response.status !== 200) throw new Error("Public DNS lookup failed.");
    let data: { Status?: number; Answer?: { type?: number; data?: string }[] };
    try { data = JSON.parse(response.body); } catch { throw new Error("Public DNS returned invalid JSON."); }
    if (data.Status !== 0) throw new Error("Public DNS could not resolve the source host.");
    return (data.Answer ?? []).flatMap((answer) => {
      if (![1, 28].includes(answer.type ?? 0) || typeof answer.data !== "string") return [];
      return [{ address: answer.data, family: isIP(answer.data) }];
    });
  }));
  return answers.flat();
};

export function createPublicHttpClient(config: {
  resolver?: PublicResolver;
  transport?: PublicTransport;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
} = {}): PublicHttpClient {
  const resolver = config.resolver ?? (process.env.RADAR_DNS_RESOLVER === "cloudflare" ? cloudflareDnsResolver :
    (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const transport = config.transport ?? nodeTransport;
  const timeoutMs = config.timeoutMs ?? (process.env.RADAR_HTTP_TIMEOUT_MS ? Number(process.env.RADAR_HTTP_TIMEOUT_MS) : 15_000);
  if (config.timeoutMs === undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000)) {
    throw new Error("RADAR_HTTP_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }
  const maxBodyBytes = config.maxBodyBytes ?? 4 * 1024 * 1024;
  const maxRedirects = config.maxRedirects ?? 4;
  return async (input, requestOptions = {}) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = validatePublicUrl(input);
    let headers = { ...requestOptions.headers };
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const hostname = current.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
        await abortable(resolver(hostname), signal);
      if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) {
        throw new Error("Source host resolves to a private, reserved, or invalid IP address.");
      }
      const result = await abortable(transport(current, { addresses, headers, signal, maxBodyBytes }), signal);
      if (Buffer.byteLength(result.body, "utf8") > maxBodyBytes) throw new Error("Source response exceeded the size limit.");
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        if (redirects === maxRedirects) throw new Error("Source exceeded the redirect limit.");
        if (!result.headers.location) throw new Error("Source returned a redirect without a location.");
        const next = validatePublicUrl(new URL(result.headers.location, current).href);
        if (next.origin !== current.origin) {
          headers = Object.fromEntries(Object.entries(headers).filter(([key]) => !["authorization", "cookie", "proxy-authorization"].includes(key.toLowerCase())));
        }
        current = next;
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Source request failed with HTTP ${result.status}${result.status === 429 ? " (rate limited)" : ""}.`);
      }
      return { ...result, url: current.href };
    }
    throw new Error("Source exceeded the redirect limit.");
  };
}

export const publicHttpClient = createPublicHttpClient();
