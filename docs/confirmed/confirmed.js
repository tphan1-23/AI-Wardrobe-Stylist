// Landing page for the link in the sign-up confirmation email.
//
// Supabase confirms the account first, then sends the browser here with the result in the address:
//   success:  #access_token=...&refresh_token=...&type=signup      (login tokens: never read, logged or sent)
//   problem:  #error=access_denied&error_code=otp_expired&error_description=...
// This page only shows a message. It does not log the person in (the app does that when they log in), and it
// removes the fragment from the address bar so the tokens do not stay in the browser history.

// Decides what to tell the person from the address. Pure, so it is unit-tested (tests/confirmedPage.test.ts).
export function statusFromUrl(hash = "", search = "") {
  const params = new URLSearchParams(String(hash).replace(/^#/, "") + "&" + String(search).replace(/^\?/, ""));
  const error = params.get("error") || params.get("error_code");
  if (error) {
    const code = (params.get("error_code") || "").toLowerCase();
    const text = (params.get("error_description") || "").toLowerCase();
    return code.includes("expired") || text.includes("expired") ? "expired" : "invalid";
  }
  // Confirmation arrives with a session (implicit flow) or a code (PKCE flow).
  if (params.has("access_token") || params.has("code") || params.get("type") === "signup") return "confirmed";
  return "none";
}

export const MESSAGES = {
  confirmed: {
    title: "Email confirmed",
    body: "Your account is ready. Open the DressWell app and log in with your email and password.",
  },
  expired: {
    title: "This link has expired",
    body: "Open the DressWell app and sign up again with the same email. We will send you a new link.",
  },
  invalid: {
    title: "This link did not work",
    body: "It may have been used already. If your account is confirmed, open the DressWell app and log in. If not, sign up again with the same email.",
  },
  none: {
    title: "DressWell",
    body: "Open this page from the confirmation link in your email.",
  },
};

// The symbol in the circle: a check only when the account really is confirmed.
export const MARKS = { confirmed: "✓", expired: "!", invalid: "!", none: "?" };

// `win` and `doc` are passed in so this can be tested with stand-ins; the page passes the real ones.
export function show(win, doc) {
  const status = statusFromUrl(win.location.hash, win.location.search);
  // Drop the fragment and query so login tokens never stay in the address bar or the history.
  win.history.replaceState(null, "", win.location.pathname);
  doc.body.dataset.status = status;
  doc.getElementById("title").textContent = MESSAGES[status].title;
  doc.getElementById("body").textContent = MESSAGES[status].body;
  doc.getElementById("mark").textContent = MARKS[status];
  return status;
}

if (typeof document !== "undefined" && typeof window !== "undefined") show(window, document);
