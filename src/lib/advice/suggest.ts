import Anthropic from "@anthropic-ai/sdk";

/**
 * Asking Claude what to do next on a plot.
 *
 * This is advice, never a record. Nothing here writes to the ledger: it comes
 * back as a list the manager reads and either accepts onto the plot's task list
 * or ignores. That is deliberate — the farm's books are things people observed,
 * and a suggestion is not an observation.
 *
 * The prompt is built from `cycleBriefing`, so what the model is shown is the
 * same text the manager can see on screen. If the advice looks wrong, the
 * briefing is there to say why.
 */

export type Suggestion = {
  title: string;
  dueDate: string;
  isCritical: boolean;
  /** Why, in the manager's terms. Shown next to the suggestion, not stored. */
  reason: string;
};

export type SuggestResult =
  | { ok: true; suggestions: Suggestion[]; note: string | null }
  | { ok: false; error: string };

const MODEL = "claude-opus-5";

const SYSTEM = `You advise the manager of a small family pineapple farm in the Philippines. He works in the field on a phone, and he is the one who will carry out whatever you suggest.

You will be given everything the farm has recorded about one plot: its D-leaf measurements, its costs, the work logged on it, and the tasks already planned. Suggest the small number of things worth doing on this plot in the coming weeks.

How to think about it:
- D-leaf readings exist to time one decision: when to apply liquid to induce fruiting. If the plants are close to forcing length, or the readings have gone stale, that is usually the most important thing on the plot.
- Two readings are the minimum for a growth rate. If there is only one, or none, say so and suggest measuring rather than inventing a date.
- Costs are shown so you can notice something out of line — a plot spending far more on labour than others, an input drawn twice — not so you can tell him to spend less in general.
- Compare against what is already on the task list. Never suggest something that is already there.

Rules:
- Between one and five suggestions. Fewer is better. If the plot genuinely needs nothing, return none.
- Each one must be a physical thing a person can do on a specific day: measure, apply, weed, count, inspect, buy. Not "monitor closely", not "consider optimising".
- Mark a suggestion critical only if letting it slip costs the crop or the season — a missed forcing window, not a tidy-up.
- Never invent a figure. If something is unknown, the suggestion is to go and find it out.
- Base every suggestion on what is in the briefing. Do not assume practices the farm has not recorded.`;

const TOOL = {
  name: "suggest_actions",
  description: "Return the actions worth doing on this plot.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "The action, phrased as an instruction, under 80 characters. e.g. 'Measure D-leaf on 10 plants'",
            },
            due_date: {
              type: "string",
              description: "When it should be done, as yyyy-mm-dd. Today or later.",
            },
            is_critical: {
              type: "boolean",
              description: "True only if letting this slip costs the crop or the season.",
            },
            reason: {
              type: "string",
              description:
                "One sentence saying what in the data led to this, in plain words the manager would use.",
            },
          },
          required: ["title", "due_date", "is_critical", "reason"],
        },
      },
      note: {
        type: ["string", "null"],
        description:
          "One line for the manager if something important is missing from the records. Null if not.",
      },
    },
    required: ["suggestions", "note"],
  },
};

export type Photo = { mediaType: string; base64: string; takenOn: string };

export async function suggestActions(
  briefing: string,
  today: string,
  photos: Photo[] = [],
): Promise<SuggestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Suggestions are switched off — no Anthropic API key is configured.",
    };
  }

  const content: Anthropic.ContentBlockParam[] = [];
  for (const photo of photos) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: photo.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: photo.base64,
      },
    });
    content.push({ type: "text", text: `Photo of this plot taken ${photo.takenOn}.` });
  }
  content.push({
    type: "text",
    text: `${briefing}\n\nSuggest what to do on this plot. Dates must be ${today} or later. Call suggest_actions with your answer.`,
  });

  try {
    // Streamed because adaptive thinking can run long, and a serverless
    // function that waits on one silent connection is the thing that times out.
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools: [TOOL],
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();

    for (const block of message.content) {
      if (block.type !== "tool_use" || block.name !== TOOL.name) continue;
      return readSuggestions(block.input, today);
    }
    return { ok: false, error: "Claude did not come back with anything usable." };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic();
  return cached;
}

/**
 * The model's answer, taken apart carefully.
 *
 * A schema is a request, not a guarantee, and this output ends up in front of
 * someone who will act on it. Anything malformed is dropped rather than shown
 * half-built.
 */
export function readSuggestions(input: unknown, today: string): SuggestResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Claude did not come back with anything usable." };
  }
  const raw = (input as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Claude did not come back with anything usable." };
  }

  const suggestions: Suggestion[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    const due = typeof row.due_date === "string" ? row.due_date.trim() : "";
    if (title.length < 3) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    suggestions.push({
      title: title.slice(0, 120),
      // A suggestion dated in the past is one he can never be on time for.
      dueDate: due < today ? today : due,
      isCritical: row.is_critical === true,
      reason: reason.slice(0, 300),
    });
    if (suggestions.length === 5) break;
  }

  const noteRaw = (input as { note?: unknown }).note;
  const note = typeof noteRaw === "string" && noteRaw.trim().length > 0 ? noteRaw.trim() : null;
  return { ok: true, suggestions, note };
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check it in the site settings.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude is busy right now. Try again in a minute.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach Claude. Check the signal and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude could not answer (${error.status ?? "error"}). Try again.`;
  }
  return "Something went wrong asking Claude.";
}
