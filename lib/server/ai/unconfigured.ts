/** The provider used when no model is configured. SERVER ONLY.
 *
 * Follows the repository's honesty rule: an absent capability throws and names
 * what would enable it, rather than returning invented output. A stub that
 * quietly produced plausible-looking code would be far worse here than
 * elsewhere — it would look like the builder worked.
 */
import type { ModelProvider, ModelResponse } from "../../ai/types";
import { CAPABILITY_REQUIREMENTS } from "../../config/env";
import { NotConfiguredError } from "../../errors";

export const unconfiguredProvider: ModelProvider = {
  id: "custom",
  spec: {
    providerId: "custom",
    modelId: "none",
    label: "No model configured",
    maxInputTokens: 0,
    maxOutputTokens: 0,
    acceptsImages: false,
  },
  async complete(): Promise<ModelResponse> {
    throw new NotConfiguredError("generation", CAPABILITY_REQUIREMENTS.generation);
  },
};
