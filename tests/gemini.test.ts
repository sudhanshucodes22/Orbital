/** The Gemini adapter, against a mocked transport.
 *
 * `fetch` is replaced, so no network call is made and no key is needed. What
 * is exercised is everything the adapter is responsible for: translating the
 * neutral request into Gemini's shape, finding the text in the response,
 * mapping every failure to a `ModelCallError` the pipeline already understands,
 * and never letting a credential into a message.
 *
 * This does **not** prove a live call works. The request shape was written from
 * Google's current documentation without one to check against, and that is
 * reported as unverified rather than implied.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createGeminiProvider, RECOMMENDED_GEMINI_MODEL } from "../lib/server/ai/providers/gemini";
import { ModelCallError } from "../lib/server/ai/providers/errors";
import { textMessage } from "../lib/ai/types";
import type { ModelRequest } from "../lib/ai/types";

const API_KEY = "AIza-TEST-KEY-must-never-appear-in-an-error";

const provider = () =>
  createGeminiProvider({
    providerId: "google",
    modelId: RECOMMENDED_GEMINI_MODEL,
    apiKey: API_KEY,
  });

/** The last request the adapter made, so the mapping can be asserted. */
let lastCall: { url: string; init: RequestInit } | null = null;
const realFetch = globalThis.fetch;

/** Installs a fetch that returns a scripted response. */
type MockResponse = { status: number; body?: unknown; text?: string };

function mockFetch(response: MockResponse | (() => never)) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastCall = { url: String(url), init };
    // A thrown response models a transport failure; narrowing here rather
    // than after keeps the rest of the closure working with a plain object.
    if (typeof response === "function") response();
    const { status, body, text } = response as MockResponse;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (text !== undefined) throw new SyntaxError("not json");
        return body;
      },
      text: async () => text ?? JSON.stringify(body ?? {}),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** A well-formed Interactions API response. */
const GOOD_BODY = {
  steps: [{ content: [{ text: '{"operations":[]}' }] }],
  usage: { total_input_tokens: 1234, total_output_tokens: 567 },
  status: "completed",
};

const REQUEST: ModelRequest = {
  system: "You are a code generator.",
  messages: [textMessage("user", "Make the hero darker.")],
  maxOutputTokens: 4096,
};

beforeEach(() => {
  lastCall = null;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("gemini adapter — request mapping", () => {
  it("posts to the Interactions API with the key in a header", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    await provider().complete(REQUEST);

    assert.equal(lastCall!.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(lastCall!.init.method, "POST");

    const headers = lastCall!.init.headers as Record<string, string>;
    assert.equal(headers["x-goog-api-key"], API_KEY);
    // Never in the URL: proxies log URLs, and a key in a log is a leaked key.
    assert.doesNotMatch(lastCall!.url, /AIza/);
  });

  it("lifts the system prompt into system_instruction", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    await provider().complete(REQUEST);

    const payload = JSON.parse(lastCall!.init.body as string);
    assert.equal(payload.system_instruction, "You are a code generator.");
    // And it is not also left in the conversation, which would send it twice.
    assert.equal(payload.input.length, 1);
  });

  it("sends input as a step list, not a turn list", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    await provider().complete({
      messages: [textMessage("user", "hi"), textMessage("assistant", "hello")],
    });

    const payload = JSON.parse(lastCall!.init.body as string);

    // These assertions are the shape the live API actually accepts, checked
    // against it. The adapter was first written from documentation as a turn
    // list — `[{role, parts:[{text}]}]` — and the real endpoint rejects that
    // with "Unknown parameter 'parts'" and "use step_list input format
    // instead of turn_list". A mock can only assert what its author believed,
    // which is why these were wrong until a real call corrected them.
    assert.deepEqual(payload.input, [
      { type: "text", text: "hi" },
      { type: "text", text: "hello" },
    ]);
    for (const step of payload.input) {
      assert.equal("role" in step, false, "a step must not carry a role");
      assert.equal("parts" in step, false, "a step must not carry parts");
    }
  });

  it("passes a JSON schema through as native structured output", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    const schema = { type: "object", properties: { operations: { type: "array" } } };
    await provider().complete({ ...REQUEST, jsonSchema: schema });

    const payload = JSON.parse(lastCall!.init.body as string);
    // Vendor-enforced beats asking for JSON in the prompt: a response that
    // does not match becomes the vendor's failure rather than the parser's.
    //
    // `response_format` *is* the schema. The OpenAI-style wrapper
    // `{type:"json_schema", schema}` — which is what the documentation reading
    // suggested — is rejected: "The value 'json_schema' is not supported for
    // 'type'. Supported values: object, array, string, number…". Verified live.
    assert.deepEqual(payload.response_format, schema);
    assert.equal(payload.response_format.type, "object");
  });

  it("sends the model and token ceiling", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    await provider().complete(REQUEST);

    const payload = JSON.parse(lastCall!.init.body as string);
    assert.equal(payload.model, RECOMMENDED_GEMINI_MODEL);
    assert.equal(payload.generation_config.max_output_tokens, 4096);
  });
});

describe("gemini adapter — success", () => {
  it("returns the text, usage, model and stop reason", async () => {
    mockFetch({ status: 200, body: GOOD_BODY });
    const result = await provider().complete(REQUEST);

    assert.equal(result.text, '{"operations":[]}');
    assert.equal(result.usage.inputTokens, 1234);
    assert.equal(result.usage.outputTokens, 567);
    assert.equal(result.providerId, "google");
    assert.equal(result.modelId, RECOMMENDED_GEMINI_MODEL);
    assert.equal(result.stopReason, "completed");
  });

  it("joins text split across steps", async () => {
    mockFetch({
      status: 200,
      body: { steps: [{ content: [{ text: '{"a":' }] }, { content: [{ text: "1}" }] }] },
    });
    const result = await provider().complete(REQUEST);
    assert.equal(result.text, '{"a":1}');
  });

  it("still finds text in the older generateContent shape", async () => {
    // A deployment pointed at the older surface degrades to working rather
    // than reporting that the model returned nothing.
    mockFetch({
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    });
    const result = await provider().complete(REQUEST);

    assert.equal(result.text, "hello");
    assert.equal(result.usage.inputTokens, 10);
    assert.equal(result.stopReason, "STOP");
  });

  it("reports usage as null rather than zero when it is absent", async () => {
    mockFetch({ status: 200, body: { steps: [{ content: [{ text: "x" }] }] } });
    const result = await provider().complete(REQUEST);

    // Zero would be a claim about cost; null is the absence of one.
    assert.equal(result.usage.inputTokens, null);
    assert.equal(result.usage.outputTokens, null);
  });
});

describe("gemini adapter — failures", () => {
  const cases: [string, number, { retryable: boolean; matches: RegExp }][] = [
    ["an invalid key", 401, { retryable: false, matches: /rejected the API key.*GEMINI_API_KEY/ }],
    ["a forbidden key", 403, { retryable: false, matches: /rejected the API key/ }],
    ["an unknown model", 404, { retryable: false, matches: /does not recognise.*GENERATION_MODEL/ }],
    ["rate limiting", 429, { retryable: true, matches: /rate limiting/ }],
    ["a malformed request", 400, { retryable: false, matches: /malformed/ }],
    ["an outage", 503, { retryable: true, matches: /unavailable/ }],
  ];

  for (const [name, status, expected] of cases) {
    it(`maps ${name} to a ModelCallError`, async () => {
      mockFetch({ status, body: { error: { message: "vendor detail" } } });

      await assert.rejects(
        () => provider().complete(REQUEST),
        (error: unknown) => {
          assert.ok(error instanceof ModelCallError, "must be a ModelCallError");
          assert.equal(error.status, status);
          assert.equal(error.retryable, expected.retryable);
          assert.match(error.message, expected.matches);
          return true;
        }
      );
    });
  }

  it("never puts the API key in an error", async () => {
    for (const status of [400, 401, 429, 500]) {
      mockFetch({ status, body: { error: { message: `debug echo ${API_KEY}` } } });
      await assert.rejects(
        () => provider().complete(REQUEST),
        (error: Error) => {
          // The vendor body is read and discarded rather than quoted: Google's
          // error payloads can echo request metadata, and this message is
          // persisted on a run and shown in a browser.
          assert.doesNotMatch(error.message, /AIza/);
          assert.doesNotMatch(error.message, /debug echo/);
          return true;
        }
      );
    }
  });

  it("treats a network failure as retryable", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      () => provider().complete(REQUEST),
      (error: unknown) => {
        assert.ok(error instanceof ModelCallError);
        assert.equal(error.retryable, true);
        assert.match(error.message, /Could not reach/);
        return true;
      }
    );
  });

  it("treats a timeout as retryable and a cancellation as not", async () => {
    for (const [name, retryable, pattern] of [
      ["TimeoutError", true, /did not respond in time/],
      ["AbortError", false, /cancelled/],
    ] as const) {
      mockFetch(() => {
        const error = new Error(name);
        error.name = name;
        throw error;
      });

      await assert.rejects(
        () => provider().complete(REQUEST),
        (error: unknown) => {
          assert.ok(error instanceof ModelCallError);
          assert.equal(error.retryable, retryable);
          assert.match(error.message, pattern);
          return true;
        }
      );
    }
  });
});

describe("gemini adapter — malformed output", () => {
  it("rejects a response that is not JSON", async () => {
    mockFetch({ status: 200, text: "<html>gateway error</html>" });

    await assert.rejects(
      () => provider().complete(REQUEST),
      (error: unknown) => {
        assert.ok(error instanceof ModelCallError);
        assert.match(error.message, /not JSON/);
        assert.equal(error.retryable, true);
        return true;
      }
    );
  });

  it("rejects a response with no text rather than returning an empty string", async () => {
    // An empty string would reach the planner and be blamed on the model for
    // "returning nothing usable". This is the adapter failing to find the
    // text, which is a different problem with a different fix.
    for (const body of [{}, { steps: [] }, { steps: [{ content: [] }] }, { candidates: [] }]) {
      mockFetch({ status: 200, body });
      await assert.rejects(
        () => provider().complete(REQUEST),
        (error: unknown) => {
          assert.ok(error instanceof ModelCallError);
          assert.match(error.message, /returned no text|shape may have changed/);
          return true;
        }
      );
    }
  });

  it("does not crash on a deeply unexpected shape", async () => {
    for (const body of [null, "a string", 42, { steps: "not an array" }]) {
      mockFetch({ status: 200, body });
      // Whatever arrives, the failure is a ModelCallError — never a TypeError
      // escaping into the pipeline as an unexplained crash.
      await assert.rejects(
        () => provider().complete(REQUEST),
        (error: unknown) => error instanceof ModelCallError
      );
    }
  });
});

describe("gemini model selection", () => {
  it("recommends a model that is current and free-tier", () => {
    // Checked against Google's published model list and pricing rather than
    // assumed: gemini-2.0-flash is shut down, and picking it from memory is
    // exactly the mistake this constant exists to prevent.
    assert.equal(RECOMMENDED_GEMINI_MODEL, "gemini-2.5-flash");
    assert.doesNotMatch(RECOMMENDED_GEMINI_MODEL, /^gemini-(1\.5|2\.0)/, "retired model family");
  });
});
