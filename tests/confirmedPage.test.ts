import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Plain JavaScript on purpose: GitHub Pages serves the file as it is. The DOM code is skipped in Node.
// @ts-expect-error no type declarations for the page script
import { MARKS, MESSAGES, show, statusFromUrl } from "../docs/confirmed/confirmed.js";

const read = (name: string) => readFileSync(new URL(`../docs/confirmed/${name}`, import.meta.url), "utf8");

describe("statusFromUrl (what the confirmation link says)", () => {
  it("recognizes a confirmed account from the session Supabase puts in the address", () => {
    expect(statusFromUrl("#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=signup")).toBe("confirmed");
    expect(statusFromUrl("#type=signup")).toBe("confirmed");
    expect(statusFromUrl("?type=signup", "")).toBe("confirmed");
  });

  it("does not call a sign-in that landed here an email confirmation (for example Google sign-in that missed the app)", () => {
    // Google sign-in returns a session with a provider token and no type=signup.
    expect(statusFromUrl("#access_token=abc&refresh_token=def&provider_token=g&token_type=bearer")).toBe("signed_in");
    expect(statusFromUrl("", "?code=pkce-code")).toBe("signed_in");
    expect(statusFromUrl("#access_token=abc&type=recovery")).toBe("signed_in");
    expect(statusFromUrl("#access_token=abc&type=signup")).toBe("confirmed");
  });

  it("recognizes an expired link, from the code or the description", () => {
    expect(statusFromUrl("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toBe("expired");
    expect(statusFromUrl("#error=access_denied&error_description=Link+has+Expired")).toBe("expired");
    expect(statusFromUrl("", "?error=access_denied&error_code=OTP_EXPIRED")).toBe("expired");
  });

  it("treats any other error as an invalid link, and an error beats a token", () => {
    expect(statusFromUrl("#error=server_error&error_description=boom")).toBe("invalid");
    expect(statusFromUrl("#error_code=weird")).toBe("invalid");
    expect(statusFromUrl("#error=access_denied&access_token=abc")).toBe("invalid");
  });

  it("says nothing is confirmed when the page is opened without a link", () => {
    expect(statusFromUrl()).toBe("none");
    expect(statusFromUrl("", "")).toBe("none");
    expect(statusFromUrl("#", "?")).toBe("none");
    expect(statusFromUrl("#foo=bar", "?x=1")).toBe("none");
  });

  it("has a message and a symbol for every status, and only confirmed gets the check", () => {
    for (const status of ["confirmed", "expired", "invalid", "signed_in", "none"]) {
      expect(MESSAGES[status].title.length).toBeGreaterThan(0);
      expect(MESSAGES[status].body.length).toBeGreaterThan(0);
      expect(MARKS[status].length).toBeGreaterThan(0);
    }
    expect(MARKS.confirmed).toBe("✓");
    for (const status of ["expired", "invalid", "signed_in", "none"]) expect(MARKS[status]).not.toBe("✓");
    expect(MESSAGES.signed_in.title).not.toMatch(/confirmed/i);
    expect(MESSAGES.signed_in.body).toMatch(/did not receive/i);
    expect(MESSAGES.confirmed.title).toMatch(/confirmed/i);
    expect(MESSAGES.expired.body).toMatch(/sign up again/i);
  });
});

describe("show (what the page does with the address)", () => {
  function fakePage(hash: string, search = "") {
    const text: Record<string, string> = {};
    const elements = (id: string) => ({
      set textContent(value: string) {
        text[id] = value;
      },
    });
    const replaced: unknown[][] = [];
    const doc = { body: { dataset: {} as Record<string, string> }, getElementById: elements };
    const win = {
      location: { hash, search, pathname: "/AI-Wardrobe-Stylist/confirmed/" },
      history: { replaceState: (...args: unknown[]) => void replaced.push(args) },
    };
    return { doc, win, text, replaced };
  }

  it("shows the confirmed message and removes the login tokens from the address", () => {
    const page = fakePage("#access_token=secret&refresh_token=secret2&type=signup");
    expect(show(page.win, page.doc)).toBe("confirmed");
    expect(page.text).toEqual({ title: MESSAGES.confirmed.title, body: MESSAGES.confirmed.body, mark: MARKS.confirmed });
    expect(page.doc.body.dataset.status).toBe("confirmed");
    expect(page.replaced).toEqual([[null, "", "/AI-Wardrobe-Stylist/confirmed/"]]);
    expect(JSON.stringify(page.text)).not.toContain("secret");
  });

  it("shows the expired and invalid messages, and the neutral one with no link", () => {
    const expired = fakePage("#error=access_denied&error_code=otp_expired");
    expect(show(expired.win, expired.doc)).toBe("expired");
    expect(expired.text.mark).toBe("!");
    const invalid = fakePage("#error=server_error");
    expect(show(invalid.win, invalid.doc)).toBe("invalid");
    expect(invalid.text.mark).toBe("!");
    const google = fakePage("#access_token=secret&refresh_token=secret2&provider_token=secret3&token_type=bearer");
    expect(show(google.win, google.doc)).toBe("signed_in");
    expect(google.text.title).toBe(MESSAGES.signed_in.title);
    expect(google.text.mark).toBe("!");
    expect(JSON.stringify(google.text)).not.toContain("secret");
    expect(google.replaced).toEqual([[null, "", "/AI-Wardrobe-Stylist/confirmed/"]]);
    const none = fakePage("");
    expect(show(none.win, none.doc)).toBe("none");
    expect(none.text.title).toBe(MESSAGES.none.title);
    expect(none.replaced).toHaveLength(1);
  });
});

describe("the confirmation page files", () => {
  const html = read("index.html");
  const js = read("confirmed.js");

  it("never reads, logs or sends the login tokens in the address", () => {
    expect(js).not.toMatch(/console\./);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
    expect(js).not.toMatch(/get\(["']?(access|refresh)_token/);
  });

  it("removes the address fragment and query so tokens do not stay in the history", () => {
    expect(js).toMatch(/history\.replaceState\(null, "", win\.location\.pathname\)/);
  });

  it("loads nothing from outside (no third-party scripts, fonts or images) and is not indexed", () => {
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain('name="viewport"');
  });

  it("is wired to its script and the elements the script fills in", () => {
    expect(html).toContain('<script type="module" src="./confirmed.js"></script>');
    for (const id of ["title", "body", "mark"]) expect(html).toContain(`id="${id}"`);
    expect(js).toContain('getElementById("title")');
    expect(js).toContain('getElementById("body")');
    expect(js).toContain('getElementById("mark")');
  });

  it("keeps Pages from running Jekyll over docs/ (our docs contain double braces)", () => {
    expect(readFileSync(new URL("../docs/.nojekyll", import.meta.url), "utf8")).toBe("");
    expect(readFileSync(new URL("../docs/deployment.md", import.meta.url), "utf8")).toContain("{{");
  });
});

describe("the site root page (the address GitHub shows under Pages)", () => {
  const root = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");

  it("exists, so the address GitHub shows is not a 404", () => {
    expect(root).toContain("<title>DressWell</title>");
    expect(root).toContain('name="viewport"');
  });

  it("runs no script and loads nothing from outside; its only links go to this project's GitHub pages", () => {
    expect(root).not.toMatch(/<script/i);
    expect(root).not.toMatch(/(?:src)=/i);
    expect(root).not.toMatch(/@import|url\(/i);
    const links = [...root.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toMatch(/^https:\/\/github\.com\/tphan1-23\/AI-Wardrobe-Stylist(\/|$)/);
  });

  it("does not pretend to be the confirmation page or handle login tokens", () => {
    expect(root).not.toMatch(/access_token|refresh_token|confirmed\.js/);
    expect(root).not.toMatch(/Email confirmed/);
  });
});
