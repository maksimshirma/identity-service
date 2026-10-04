export const TEST_ORIGIN = "http://localhost:3000";

export function jsonRequest(method: string, body?: unknown, extraHeaders?: Record<string, string>): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: TEST_ORIGIN,
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Response has no Set-Cookie header");
  }
  const match = setCookie.match(/better-auth\.session_token=[^;]+/);
  if (!match) {
    throw new Error(`Set-Cookie header has no session token: ${setCookie}`);
  }
  return match[0];
}

export function withCookie(init: RequestInit, cookie: string): RequestInit {
  return {
    ...init,
    headers: {
      ...init.headers,
      Cookie: cookie,
    },
  };
}
