import { createKyselyInstance } from "../../db/kysely.js";
import { createServer } from "../../server.js";
import { jsonRequest, cookieFrom } from "../../test/http.js";
import { testDatabaseConfig, truncateAllTables } from "../../test/db.js";
import { createAuth } from "../index.js";

const db = createKyselyInstance(testDatabaseConfig());
const auth = createAuth(db, { rateLimitEnabled: false });
const app = createServer(db, auth);

beforeEach(() => truncateAllTables(db));
afterAll(() => db.destroy());

test("sign-up then sign-in returns a session cookie and get-session resolves it", async () => {
  const signUp = await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email: "owner@example.com", password: "correct-horse-battery-staple", name: "Owner" }),
  );
  expect(signUp.status).toBe(200);

  const signIn = await app.request(
    "/api/auth/sign-in/email",
    jsonRequest("POST", { email: "owner@example.com", password: "correct-horse-battery-staple" }),
  );
  expect(signIn.status).toBe(200);
  const cookie = cookieFrom(signIn);

  const session = await app.request("/api/auth/get-session", { headers: { Cookie: cookie } });
  const body = await session.json();
  expect(body.user.email).toBe("owner@example.com");
});

test("list-sessions then revoke-session instantly invalidates that session", async () => {
  await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email: "multi@example.com", password: "correct-horse-battery-staple", name: "Multi" }),
  );
  const dev1 = cookieFrom(
    await app.request(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email: "multi@example.com", password: "correct-horse-battery-staple" }),
    ),
  );
  const dev2 = cookieFrom(
    await app.request(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email: "multi@example.com", password: "correct-horse-battery-staple" }),
    ),
  );

  const list = await app.request("/api/auth/list-sessions", { headers: { Cookie: dev1 } });
  const sessions: Array<{ token: string }> = await list.json();
  expect(sessions.length).toBe(3); // sign-up itself also creates a session, plus 2 explicit sign-ins

  const dev2Token = dev2.split("=")[1];
  const target = sessions.find((s) => dev2Token.startsWith(s.token));
  expect(target).toBeDefined();

  const revoke = await app.request(
    "/api/auth/revoke-session",
    jsonRequest("POST", { token: target!.token }, { Cookie: dev1 }),
  );
  expect(revoke.status).toBe(200);

  const dev2Session = await app.request("/api/auth/get-session", { headers: { Cookie: dev2 } });
  const dev2Body = await dev2Session.json();
  expect(dev2Body).toBeNull();
});

test("enabling 2FA gates the next sign-in behind a TOTP challenge", async () => {
  await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email: "twofa@example.com", password: "correct-horse-battery-staple", name: "TwoFA" }),
  );
  const cookie = cookieFrom(
    await app.request(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email: "twofa@example.com", password: "correct-horse-battery-staple" }),
    ),
  );

  const enable = await app.request(
    "/api/auth/two-factor/enable",
    jsonRequest("POST", { password: "correct-horse-battery-staple" }, { Cookie: cookie }),
  );
  expect(enable.status).toBe(200);
  const { totpURI } = await enable.json();
  const secret = new URL(totpURI).searchParams.get("secret")!;

  const verify = await app.request(
    "/api/auth/two-factor/verify-totp",
    jsonRequest("POST", { code: totp(secret) }, { Cookie: cookie }),
  );
  expect(verify.status).toBe(200);

  const signInAgain = await app.request(
    "/api/auth/sign-in/email",
    jsonRequest("POST", { email: "twofa@example.com", password: "correct-horse-battery-staple" }),
  );
  const body = await signInAgain.json();
  expect(body.twoFactorRedirect).toBe(true);
});

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secretBase32: string, period = 30, digits = 6): string {
  const { createHmac } = require("node:crypto");
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** digits).padStart(digits, "0");
}
