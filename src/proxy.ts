import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

/**
 * Gives each page a Content-Security-Policy with a nonce made for its request. Next.js reads the nonce from the request's policy and
 * puts it on the inline scripts it writes (the bootstrap and the page's data, which differs on every request, so no hash could allow
 * it), and the root layout reads x-nonce for the import map. The development server gets no policy, so its tools work as before; every
 * build, previews and production, enforces it.
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/* Every path but the build's files, the world's modules, the maps and the API, whose responses a policy has no effect on. */
export const config = { matcher: "/((?!_next/|world/|maps/|api/).*)" };
