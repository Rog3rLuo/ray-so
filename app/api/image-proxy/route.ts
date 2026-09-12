import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/** Only raster images are proxied; SVG is excluded because it can carry script. */
const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

/**
 * Blocks the obvious SSRF targets: loopback, private ranges, link-local
 * (cloud metadata), and the unspecified address. This is a literal-host check,
 * not a full DNS-rebinding defence — it stops the realistic abuse of an open
 * image proxy, which is what matters for a fetch that only ever returns bytes
 * to the requesting browser.
 *
 * Exotic IPv4 spellings (decimal, octal, hex) do not need handling here: the
 * WHATWG URL parser normalises them to dotted-decimal before we see them.
 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  const urlQuery = req.nextUrl.searchParams.get("url");

  if (!urlQuery) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlQuery);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    /*
     * Redirects are followed by hand rather than with `redirect: "follow"`.
     * A host check only on the URL the caller supplied is not enough: a public
     * URL that answers 302 with a Location of http://127.0.0.1/... would be
     * followed by fetch straight past the check, turning this route into an
     * SSRF pivot. Re-validating every hop closes that.
     */
    let upstream: Response | null = null;
    let current = target;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (isBlockedHostname(current.hostname)) {
        return NextResponse.json({ error: "Blocked host" }, { status: 403 });
      }

      upstream = await fetch(current.href, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          // Some CDNs reject requests without a browser-ish UA or Referer.
          "User-Agent": "Mozilla/5.0 (compatible; ray-so-image-proxy/1.0)",
          Accept: "image/*,*/*;q=0.8",
        },
      });

      if (upstream.status < 300 || upstream.status >= 400) break;

      const location = upstream.headers.get("location");
      if (!location) break;

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return NextResponse.json({ error: "Invalid redirect" }, { status: 502 });
      }

      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
      }

      current = next;
    }

    if (!upstream) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream responded ${upstream.status}` }, { status: 502 });
    }

    const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }

    const declaredLength = Number(upstream.headers.get("content-length") || "0");
    if (declaredLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        // Long-lived: the point of the proxy is a stable same-origin URL that
        // html-to-image can inline repeatedly without re-hitting the origin.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Upstream timed out" : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
