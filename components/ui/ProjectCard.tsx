import Link from "next/link";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import type { Project } from "@/lib/domain";
import { DeleteProjectButton } from "./DeleteProjectButton";
import { formatDate, formatRelative } from "./format";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { tokens } from "./tokens";

/** A project in the grid.
 *
 * The whole card is one link, so the click target is the card rather than a
 * 60px strip of title text. That rules out nesting the delete control inside
 * it — an interactive element inside an anchor is invalid and behaves
 * differently in every browser — so delete is a sibling layered on top, and
 * the card body reserves room for it on the right.
 */
export function ProjectCard({
  project,
  deleteAction,
  delay = 0,
}: {
  project: Project;
  deleteAction: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  delay?: number;
}) {
  return (
    <li
      className="o-enter"
      style={{ position: "relative", animationDelay: delay ? `${delay}ms` : undefined }}
    >
      <Panel interactive lit style={{ padding: 0, height: "100%" }}>
        <Link
          href={`/projects/${project.id}`}
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "19px 21px 18px",
            color: tokens.text,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusPill status={project.status} size="sm" />
          </div>

          <h3
            style={{
              /* Right padding clears the delete control layered above. */
              margin: "13px 96px 0 0",
              fontFamily: tokens.display,
              fontWeight: 500,
              fontSize: 19,
              lineHeight: 1.25,
              letterSpacing: "-.02em",
            }}
          >
            {project.name}
          </h3>

          {project.description && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: tokens.textMuted,
                /* Two lines, so a long description cannot make one card in the
                 * grid twice the height of its neighbour. */
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {project.description}
            </p>
          )}

          {/* Pushes the meta row to the bottom so cards of different content
              length still line their footers up. */}
          <div style={{ flex: 1, minHeight: 14 }} />

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              paddingTop: 14,
              borderTop: `1px solid ${tokens.borderSoft}`,
              fontFamily: tokens.mono,
              fontSize: 10,
              letterSpacing: ".1em",
              color: tokens.textFaint,
            }}
          >
            <span>{formatRelative(project.updatedAt).toUpperCase()}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(project.createdAt).toUpperCase()}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: tokens.accent, fontSize: 12.5, letterSpacing: 0 }}>Open →</span>
          </div>
        </Link>
      </Panel>

      <div style={{ position: "absolute", top: 15, right: 15, zIndex: 2 }}>
        <DeleteProjectButton
          projectId={project.id}
          projectName={project.name}
          action={deleteAction}
        />
      </div>
    </li>
  );
}
