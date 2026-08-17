/** Building the model's view of a project.
 *
 * "Make the login button blue" must not ship the repository. This assembles a
 * budgeted window: always the path map, then the highest-scoring files until
 * the budget runs out.
 *
 * Scoring is lexical — path and content matching against terms from the
 * prompt, plus structural bonuses for entrypoints and recency. That is
 * deliberately the simple version. It is legible, has no index to maintain and
 * no embedding provider to configure, and it is a genuinely strong baseline
 * for a project of a few dozen files. It will not scale to thousands, at which
 * point the honest upgrade is a symbol index or embeddings behind this same
 * function signature — callers ask for context and do not know how it was
 * chosen.
 */
import type {
  ContextBudget,
  ContextRequest,
  ContextSlice,
  ContextTurn,
  ProjectContext,
  ProjectMap,
  ProjectFile,
  SelectionReason,
  Session,
} from "../domain";
import { DEFAULT_CONTEXT_BUDGET, normalizeFilePath } from "../domain";
import { getContainer } from "../server/container";
import { listFiles } from "./files";
import { getProject } from "./projects";

/** Paths that anchor a project regardless of the prompt. A model that cannot
 *  see the manifest will invent dependencies that are not installed. */
const ENTRYPOINT_PATTERNS: readonly RegExp[] = [
  /^package\.json$/,
  /^(next|vite|tailwind|tsconfig)\.[^/]+$/,
  /^(app|src|pages)\/layout\.[jt]sx?$/,
  /^(app|src|pages)\/page\.[jt]sx?$/,
  /^index\.html$/,
];

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for",
  "with", "make", "add", "change", "update", "set", "it", "its", "this", "that",
  "please", "can", "you", "i", "want", "need", "should", "more", "less", "be",
]);

/** Terms worth matching on. Short and stop words are dropped because they
 *  match everything, which is the same as matching nothing. */
export function extractTerms(prompt: string): string[] {
  const seen = new Set<string>();
  for (const raw of prompt.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

const MAX_MAP_PATHS = 400;

function buildMap(files: readonly ProjectFile[]): ProjectMap {
  const paths = files.map((f) => f.path).sort();
  return {
    paths: paths.slice(0, MAX_MAP_PATHS),
    totalFiles: paths.length,
    omitted: Math.max(0, paths.length - MAX_MAP_PATHS),
  };
}

interface Candidate {
  file: ProjectFile;
  score: number;
  reason: SelectionReason;
}

function scoreFile(
  file: ProjectFile,
  terms: readonly string[],
  focus: ReadonlySet<string>,
  recent: ReadonlySet<string>
): Candidate | null {
  if (focus.has(file.path)) {
    return { file, score: 1000, reason: "explicit" };
  }

  let score = 0;
  let reason: SelectionReason = "contentMatch";

  const lowerPath = file.path.toLowerCase();
  let pathHits = 0;
  for (const term of terms) if (lowerPath.includes(term)) pathHits++;
  if (pathHits > 0) {
    // A path match is far stronger evidence than a body match: a term in
    // "components/LoginButton.tsx" means the file is about the thing asked
    // for, whereas the same term in a body may be one word in a comment.
    score += pathHits * 40;
    reason = "pathMatch";
  }

  if (file.content) {
    const lower = file.content.toLowerCase();
    let bodyHits = 0;
    for (const term of terms) {
      const n = lower.split(term).length - 1;
      if (n > 0) bodyHits += Math.min(n, 5);
    }
    if (bodyHits > 0) {
      score += bodyHits * 3;
      if (reason !== "pathMatch") reason = "contentMatch";
    }
  }

  if (ENTRYPOINT_PATTERNS.some((re) => re.test(file.path))) {
    score += 25;
    if (score === 25) reason = "entrypoint";
  }

  if (recent.has(file.path)) {
    score += 30;
    if (reason === "contentMatch" && pathHits === 0) reason = "recentlyChanged";
  }

  return score > 0 ? { file, score, reason } : null;
}

/** Cuts a file down to the regions around its matches.
 *
 * Beats truncating at the head, which for a component is imports — the least
 * useful part. Whole-file is preferred when it fits; this only runs when it
 * does not. */
function windowContent(content: string, terms: readonly string[], maxBytes: number): string {
  const lines = content.split("\n");
  const wanted = new Set<number>();
  const RADIUS = 12;

  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    if (terms.some((t) => lower.includes(t))) {
      for (let j = Math.max(0, i - RADIUS); j <= Math.min(lines.length - 1, i + RADIUS); j++) {
        wanted.add(j);
      }
    }
  });

  // No match in the body — it scored on path alone, so the head is as good a
  // guess as any.
  if (wanted.size === 0) return content.slice(0, maxBytes);

  const ordered = [...wanted].sort((a, b) => a - b);
  const out: string[] = [];
  let previous = -1;
  let used = 0;
  for (const i of ordered) {
    if (previous >= 0 && i > previous + 1) out.push(`… ${i - previous - 1} lines omitted …`);
    const line = lines[i];
    used += line.length + 1;
    if (used > maxBytes) { out.push("… truncated …"); break; }
    out.push(line);
    previous = i;
  }
  return out.join("\n");
}

/** Prior prompts for this project, oldest first. */
async function loadHistory(projectId: ContextRequest["projectId"]): Promise<ContextTurn[]> {
  const { runs } = await getContainer().runs.query({ projectId, limit: 12 });
  return runs
    .slice()
    .reverse()
    .map((r) => ({ prompt: r.prompt, summary: r.plan?.summary ?? null, at: r.createdAt }));
}

export async function buildProjectContext(
  session: Session,
  request: ContextRequest
): Promise<ProjectContext> {
  const project = await getProject(session, request.projectId);
  const budget: ContextBudget = request.budget ?? DEFAULT_CONTEXT_BUDGET;

  const files = await listFiles(session, request.projectId);
  const terms = extractTerms(request.prompt);

  const focus = new Set<string>();
  for (const p of request.focusPaths ?? []) {
    const verdict = normalizeFilePath(p);
    if (verdict.ok) focus.add(verdict.path);
  }

  const { runs } = await getContainer().runs.query({
    projectId: request.projectId,
    limit: 1,
  });
  const recent = new Set<string>(runs[0]?.report?.changedPaths ?? []);

  const candidates = files
    .map((f) => scoreFile(f, terms, focus, recent))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);

  const slices: ContextSlice[] = [];
  let usedBytes = 0;

  for (const candidate of candidates) {
    if (slices.length >= budget.maxFiles) break;
    if (usedBytes >= budget.maxContentBytes) break;

    const full = candidate.file.content ?? "";
    const remaining = budget.maxContentBytes - usedBytes;
    const allowance = Math.min(budget.maxBytesPerFile, remaining);
    if (allowance <= 0) break;

    const truncated = full.length > allowance;
    const content = truncated ? windowContent(full, terms, allowance) : full;

    slices.push({
      path: candidate.file.path,
      content,
      truncated,
      reason: candidate.reason,
      score: candidate.score,
      byteSize: content.length,
    });
    usedBytes += content.length;
  }

  return {
    projectId: request.projectId,
    revisionId: project.currentRevisionId,
    map: buildMap(files),
    slices,
    history: await loadHistory(request.projectId),
    usedBytes,
    budget,
    builtAt: new Date().toISOString(),
  };
}

/** Renders a context window as the text block a model sees.
 *
 * Kept here rather than in a provider adapter: how a project is described is a
 * product decision and must read identically whichever vendor is answering.
 */
export function renderContext(context: ProjectContext): string {
  const parts: string[] = [];

  parts.push("<project_map>");
  for (const p of context.map.paths) parts.push(p);
  if (context.map.omitted > 0) parts.push(`… ${context.map.omitted} more files …`);
  parts.push("</project_map>");

  if (context.history.length > 0) {
    // Prompt *and* outcome. The prompt alone tells the model what was asked;
    // the summary tells it what actually landed, which is what makes a
    // follow-up like "now make the CTA brighter" resolvable — "the CTA" refers
    // to the thing the previous turn changed, not to an idea in the abstract.
    parts.push("<previous_instructions>");
    for (const turn of context.history) {
      parts.push(turn.summary ? `- ${turn.prompt} → ${turn.summary}` : `- ${turn.prompt}`);
    }
    parts.push("</previous_instructions>");
  }

  for (const slice of context.slices) {
    parts.push(`<file path="${slice.path}"${slice.truncated ? ' partial="true"' : ""}>`);
    parts.push(slice.content);
    parts.push("</file>");
  }

  return parts.join("\n");
}
