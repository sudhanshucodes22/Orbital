/** Branded identifiers.
 *
 * A plain `string` for every id makes it trivially easy to pass a projectId
 * where a workspaceId belongs. Branding costs nothing at runtime — these are
 * strings — but the compiler stops the mix-up.
 */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type UserId = Brand<string, "UserId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ProjectId = Brand<string, "ProjectId">;
export type RevisionId = Brand<string, "RevisionId">;
export type GenerationId = Brand<string, "GenerationId">;
export type ArtifactId = Brand<string, "ArtifactId">;

export const asUserId = (v: string) => v as UserId;
export const asWorkspaceId = (v: string) => v as WorkspaceId;
export const asProjectId = (v: string) => v as ProjectId;
export const asRevisionId = (v: string) => v as RevisionId;
export const asGenerationId = (v: string) => v as GenerationId;
export const asArtifactId = (v: string) => v as ArtifactId;

/** ISO-8601 timestamp. Stored and transported as a string so it survives
 *  serialisation across the server/client boundary without a Date round-trip. */
export type Timestamp = string;
