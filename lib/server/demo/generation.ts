/** The deterministic template generator. SERVER ONLY.
 *
 * IMPORTANT: this is not AI. It is a fixed template with the brief woven in,
 * and every surface that shows its output says so.
 *
 * It used to be a whole generation engine with its own job store, its own
 * time-based staging and its own revision writing. All of that moved to
 * lib/server/pipeline: the template now supplies *content*, and the pipeline
 * owns run state, validation and revisions. There is one generation
 * architecture, and this is one executor plugged into it.
 *
 * Served under `default-src 'none'; style-src 'unsafe-inline'; img-src data:`,
 * so: no scripts, no webfonts, no remote images. Everything below is system
 * type, CSS gradients and inline SVG.
 */
import type { GeneratedSite, InputArtifact, SitePage } from "../../domain";
import { NotFoundError } from "../../errors";
import { read } from "./store";


export function describeInputs(inputs: readonly InputArtifact[]): string {
  if (inputs.length === 0) return "no inputs";
  return inputs
    .map((i) => (i.kind === "text" ? `text (${i.text.length} chars)` : i.kind))
    .join(", ");
}

export function buildSite(projectName: string, inputs: readonly InputArtifact[]): GeneratedSite {
  const brief =
    inputs.find((i): i is Extract<InputArtifact, { kind: "text" }> => i.kind === "text")?.text ??
    "";
  const files = inputs.filter((i) => i.kind !== "text");

  const safe = (v: string) =>
    v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  // First sentence becomes the subhead; the rest is dropped rather than
  // dumped on the page.
  const firstSentence = brief.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const subhead =
    firstSentence ||
    "A starting point generated from your inputs, ready to keep talking to.";

  const CSS = `
*{box-sizing:border-box}
:root{color-scheme:dark}
body{margin:0;background:#04060b;color:#e9ebf2;
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.glow{position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(760px 460px at 78% -6%,rgba(124,230,255,.14),transparent 62%),
    radial-gradient(620px 520px at 4% 88%,rgba(164,139,255,.11),transparent 66%)}
.wrap{position:relative;z-index:1;max-width:940px;margin:0 auto;padding:0 28px}
nav{display:flex;align-items:center;gap:26px;padding:26px 0 0;font-size:14px}
nav .brand{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-.01em}
nav .dot{width:16px;height:16px;border-radius:50%;border:1px solid rgba(160,225,255,.65);
  position:relative;box-shadow:0 0 12px rgba(124,230,255,.3) inset}
nav .dot i{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;
  border-radius:50%;background:#bdf1ff}
nav .links{margin-left:auto;display:flex;gap:20px;color:rgba(233,235,242,.62)}
nav .links a:hover{color:#fff}
header{padding:88px 0 22px}
.eyebrow{font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;
  text-transform:uppercase;color:rgba(124,230,255,.8)}
h1{margin:20px 0 0;font-size:clamp(34px,6vw,60px);line-height:1.02;letter-spacing:-.035em;
  font-weight:600}
h1 em{font-style:italic;font-weight:400;color:#a9e4ff}
.lede{margin:20px 0 0;max-width:56ch;font-size:17px;color:rgba(233,235,242,.66)}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
.btn{padding:12px 22px;border-radius:999px;font-size:14.5px;font-weight:500;
  color:#04060c;background:linear-gradient(180deg,#cdf3ff,#7ad6ff);
  box-shadow:0 12px 34px rgba(122,214,255,.26)}
.btn.ghost{color:#e9ebf2;background:none;border:1px solid rgba(255,255,255,.14);box-shadow:none}
section{padding:56px 0}
h2{margin:0 0 8px;font-size:26px;letter-spacing:-.025em;font-weight:600}
.muted{color:rgba(233,235,242,.55)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}
.card{padding:22px 20px 24px;border:1px solid rgba(255,255,255,.09);border-radius:16px;
  background:linear-gradient(168deg,rgba(255,255,255,.05),rgba(255,255,255,.015))}
.card h3{margin:0 0 8px;font-size:16px;letter-spacing:-.015em}
.card p{margin:0;font-size:13.5px;line-height:1.6;color:rgba(233,235,242,.55)}
.card .k{font:10px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;
  color:rgba(124,230,255,.75);display:block;margin-bottom:14px}
.band{margin-top:40px;padding:26px 24px;border:1px solid rgba(124,230,255,.24);
  border-radius:16px;background:rgba(124,230,255,.06);display:flex;gap:28px;flex-wrap:wrap}
.band div{flex:1 1 140px}
.band b{display:block;font-size:26px;letter-spacing:-.02em}
.band span{font:10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.12em;
  text-transform:uppercase;color:rgba(233,235,242,.4)}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-top:28px}
.tier{padding:24px 20px 26px;border:1px solid rgba(255,255,255,.09);border-radius:16px}
.tier.featured{border-color:rgba(124,230,255,.42);
  background:linear-gradient(168deg,rgba(124,230,255,.1),rgba(255,255,255,.015))}
.tier .price{font-size:34px;letter-spacing:-.03em;margin:12px 0 2px}
.tier ul{margin:16px 0 0;padding:0;list-style:none;font-size:13.5px;
  color:rgba(233,235,242,.6);display:grid;gap:8px}
.tier li:before{content:"✓";color:rgba(124,230,255,.85);margin-right:9px}
footer{margin-top:36px;padding:26px 0 56px;border-top:1px solid rgba(255,255,255,.08);
  display:flex;gap:16px;flex-wrap:wrap;align-items:center;
  font:11px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(233,235,242,.34)}
.badge{margin-left:auto;padding:7px 12px;border-radius:999px;
  border:1px solid rgba(124,230,255,.3);color:rgba(196,236,255,.9);letter-spacing:.06em}
@media (max-width:560px){nav .links{display:none}header{padding:56px 0 12px}}
`;

  const nav = (active: string) => `
<nav>
  <a class="brand" href="/"><span class="dot"><i></i></span>${safe(projectName)}</a>
  <span class="links">
    <a href="/"${active === "/" ? ' style="color:#fff"' : ""}>Home</a>
    <a href="/pricing"${active === "/pricing" ? ' style="color:#fff"' : ""}>Pricing</a>
    <a href="/contact"${active === "/contact" ? ' style="color:#fff"' : ""}>Contact</a>
  </span>
</nav>`;

  const footer = `
<footer>
  <span>&copy; ${new Date().getFullYear()} ${safe(projectName).toUpperCase()}</span>
  <span class="badge">Generated by Orbital &middot; demo engine</span>
</footer>`;

  const shell = (title: string, active: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe(title)}</title><style>${CSS}</style></head>
<body><div class="glow"></div><div class="wrap">${nav(active)}${body}${footer}</div></body></html>`;

  const sourceLine = files.length
    ? `${files.length} attachment${files.length === 1 ? "" : "s"} &middot; ${files
        .map((f) => f.kind)
        .join(", ")}`
    : "text brief";

  const pages: SitePage[] = [
    {
      path: "/",
      title: projectName,
      source: shell(
        projectName,
        "/",
        `<header>
  <div class="eyebrow">${safe(sourceLine)}</div>
  <h1>${safe(projectName)}.<br><em>Built from what you showed it.</em></h1>
  <p class="lede">${safe(subhead)}</p>
  <div class="row"><a class="btn" href="/pricing">See pricing</a>
  <a class="btn ghost" href="/contact">Get in touch</a></div>
</header>
<section>
  <h2>What this page is</h2>
  <p class="muted">Three linked pages, one design system, generated together.</p>
  <div class="grid">
    <div class="card"><span class="k">01</span><h3>Consistent</h3>
      <p>Type scale, spacing and colour come from one token set shared by every page.</p></div>
    <div class="card"><span class="k">02</span><h3>Responsive</h3>
      <p>Fluid type and a grid that collapses to a single column on small screens.</p></div>
    <div class="card"><span class="k">03</span><h3>Versioned</h3>
      <p>Every instruction adds a revision. Nothing you liked gets overwritten.</p></div>
  </div>
  <div class="band">
    <div><b>3</b><span>pages</span></div>
    <div><b>${files.length + (brief ? 1 : 0)}</b><span>inputs read</span></div>
    <div><b>0</b><span>regenerations</span></div>
  </div>
</section>`
      ),
    },
    {
      path: "/pricing",
      title: `${projectName} — Pricing`,
      source: shell(
        `${projectName} — Pricing`,
        "/pricing",
        `<header><div class="eyebrow">Pricing</div>
<h1>Three ways to<br><em>work together.</em></h1>
<p class="lede">A second page, generated with the same tokens as the first.</p></header>
<section>
  <div class="tiers">
    <div class="tier"><h3>Starter</h3><div class="price">$0</div>
      <span class="muted">forever</span>
      <ul><li>One project</li><li>Single page</li><li>Community support</li></ul></div>
    <div class="tier featured"><h3>Studio</h3><div class="price">$29</div>
      <span class="muted">per month</span>
      <ul><li>Unlimited projects</li><li>Multi-page sites</li><li>Revision history</li></ul></div>
    <div class="tier"><h3>Team</h3><div class="price">$89</div>
      <span class="muted">per seat / month</span>
      <ul><li>Shared workspaces</li><li>Roles and permissions</li><li>Priority support</li></ul></div>
  </div>
</section>`
      ),
    },
    {
      path: "/contact",
      title: `${projectName} — Contact`,
      source: shell(
        `${projectName} — Contact`,
        "/contact",
        `<header><div class="eyebrow">Contact</div>
<h1>Start a<br><em>conversation.</em></h1>
<p class="lede">The third page in the set, linked from the same navigation.</p></header>
<section>
  <div class="grid">
    <div class="card"><span class="k">EMAIL</span><h3>hello@example.com</h3>
      <p>Replies within two working days.</p></div>
    <div class="card"><span class="k">STUDIO</span><h3>Copenhagen</h3>
      <p>Visits by appointment.</p></div>
  </div>
</section>`
      ),
    },
  ];

  return {
    pages,
    assets: [],
    tokens: {
      "color-bg": "#04060b",
      "color-text": "#e9ebf2",
      "color-accent": "#7ce6ff",
      "font-body": "system-ui, sans-serif",
      "radius-card": "16px",
    },
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------- builder-core bridge --- */

/** Route path to file path: "/" becomes index.html, "/pricing" becomes
 *  pricing.html. The generated site is static HTML, so this is a faithful
 *  representation of it rather than an invented framework layout. */
export function filePathForRoute(route: string): string {
  const trimmed = route.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}.html`;
}

export const demoPublisher = {
  async publish(revisionId: string): Promise<{ url: string }> {
    // Nothing is deployed anywhere; the local preview route is the honest
    // answer to "where can I see this".
    const found = await read((db) => db.revisions.some((r) => r.id === revisionId));
    if (!found) throw new NotFoundError("Revision");
    return { url: `/api/demo/preview/${revisionId}` };
  },
};
