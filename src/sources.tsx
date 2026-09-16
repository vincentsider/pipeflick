import { Hono } from "hono";
import type { AppEnv } from "./access";
import {
  getTranscript,
  insertVoiceSample,
  listTranscripts,
  listVoiceSamples,
  type TranscriptSummary,
  type VoiceSampleRow,
} from "./db";
import { Layout } from "./layout";
import { MAX_OUTLIER_CHARS } from "./prompts";
import { MIN_OUTLIERS, OUTLIER_FIELDS } from "./runs";

/** Pasted samples are single posts or newsletters, not whole archives. */
const MAX_SAMPLE_LENGTH = 20000;
/** Characters of a sample shown before the reader has to expand it. */
const SAMPLE_PREVIEW_LENGTH = 200;
/** Fireflies transcript ids; also guards the detail route against junk. */
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * The id of the run form. The transcript radios and the outlier textareas live
 * inside their own cards, which the design puts side by side in a grid, but
 * they all submit together. HTML's `form=` attribute associates a control with
 * a form elsewhere in the document, so the layout needs no wrapper element and
 * no script.
 */
const RUN_FORM = "start-run";

/** ISO timestamp to YYYY-MM-DD, falling back to the stored text. */
function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/** "Digital Jersey — AI in professional services" → "Digital Jersey". */
function shortTitle(title: string): string {
  return title.split(" — ")[0] ?? title;
}

/**
 * The transcript picker. One radio per stored transcript, so choosing one and
 * pressing "Draft three posts" starts a run on it. Rendered as labels rather
 * than the prototype's buttons: a label wrapping a radio is the same click
 * target, but it is checkable without script and reachable by keyboard.
 */
function TranscriptPicker({ rows }: { rows: TranscriptSummary[] }) {
  if (rows.length === 0) {
    return (
      <p class="pf-card-body">
        No transcripts yet. <a href="/fireflies">Import one from Fireflies.</a>
      </p>
    );
  }

  return (
    <fieldset class="pf-picker">
      <legend>Transcript</legend>
      {rows.map((row, index) => (
        <label class="pf-pick">
          <input
            type="radio"
            name="transcript_id"
            value={row.id}
            form={RUN_FORM}
            checked={index === 0}
          />
          <span class="pf-dot" aria-hidden="true" />
          <span>
            <span class="pf-pick-title">{row.title}</span>
            <span class="pf-pick-meta">
              {`${formatDate(row.meeting_date)} · ${Math.round(row.duration_minutes)} min · ${row.line_count} lines kept`}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function SampleList({ rows }: { rows: VoiceSampleRow[] }) {
  if (rows.length === 0) {
    return <p class="hint">No samples yet. Paste a past post above.</p>;
  }

  return (
    <ul class="samples">
      {rows.map((row) => {
        const preview = row.body.slice(0, SAMPLE_PREVIEW_LENGTH);
        const truncated = row.body.length > SAMPLE_PREVIEW_LENGTH;
        return (
          <li>
            <p class="hint">{formatDate(row.created_at)}</p>
            <p>{truncated ? `${preview}…` : preview}</p>
            {truncated ? (
              <details>
                <summary>Full text</summary>
                <p class="sample-body">{row.body}</p>
              </details>
            ) : (
              ""
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const sources = new Hono<AppEnv>();

sources.get("/sources", async (c) => {
  const [transcripts, samples] = await Promise.all([
    listTranscripts(c.env.DB),
    listVoiceSamples(c.env.DB),
  ]);
  const saved = c.req.query("saved") === "1";
  const ready = transcripts.length > 0;
  const selected = transcripts[0];

  return c.html(
    <Layout title="Pipeflick sources" path={c.req.path} crumb="Pilot week 3">
      <section>
        <div class="pf-hero">
          <div>
            <span class="tag tag-accent tag-12">Step 1 · Sources</span>
            <h1 class="pf-h1">Your own words, first.</h1>
            <p class="pf-lede">
              Nothing is invented. Every draft is assembled from a meeting you spoke in and posts
              you already wrote, shaped by a format the market has already rewarded.
            </p>
          </div>
          <div class="pf-plates">
            <div class="pf-plate">
              <p class="pf-plate-v">3</p>
              <p class="pf-plate-k">drafts per run</p>
            </div>
            <div class="pf-plate">
              <p class="pf-plate-v">1 hr</p>
              <p class="pf-plate-k">a week, not eight</p>
            </div>
            <div class="pf-plate">
              <p class="pf-plate-v">0</p>
              <p class="pf-plate-k">posts without your yes</p>
            </div>
          </div>
        </div>

        {saved ? <p class="notice">Sample saved.</p> : ""}

        <div class="pf-cards">
          <div class="pf-card">
            <div class="pf-card-head">
              <h2>Transcripts</h2>
              <span class="tag tag-accent">Fireflies</span>
            </div>
            <p class="pf-card-body">
              Only your lines are kept. Every other speaker is dropped at import.
            </p>
            <TranscriptPicker rows={transcripts} />
          </div>

          <div class="pf-card">
            <div class="pf-card-head">
              <h2>Voice samples</h2>
              <span class="tag tag-accent">{`${samples.length} saved`}</span>
            </div>
            <p class="pf-card-body">
              Past posts you wrote yourself. These set rhythm and vocabulary, never content.
            </p>
            <form method="post" action="/sources/samples">
              <p>
                <textarea
                  name="body"
                  rows={5}
                  maxlength={MAX_SAMPLE_LENGTH}
                  required
                  placeholder="Paste a post you wrote…"
                ></textarea>
              </p>
              <p style="display:flex;gap:var(--space-2);align-items:center;margin:0">
                <button type="submit" class="btn btn-secondary">
                  Save sample
                </button>
                <span class="hint">Stored as plain text</span>
              </p>
            </form>
            <SampleList rows={samples} />
          </div>

          <div class="pf-card pf-tint">
            <div class="pf-card-head">
              <h2>Outliers</h2>
              <span class="tag tag-accent">{`${MIN_OUTLIERS} or ${OUTLIER_FIELDS.length}`}</span>
            </div>
            <p class="pf-card-body">
              Posts that over-performed in your market. Their format is extracted and reused; their
              content stays out.
            </p>
            <div style="display:flex;flex-direction:column;gap:var(--space-3)">
              {OUTLIER_FIELDS.map((name, index) => (
                <div class="pf-outlier">
                  <span class="pf-letter" aria-hidden="true">
                    {["A", "B", "C"][index]}
                  </span>
                  <div>
                    <label for={name} class="sr-only">
                      {`Outlier ${["A", "B", "C"][index]}`}
                    </label>
                    <textarea
                      id={name}
                      name={name}
                      form={RUN_FORM}
                      rows={2}
                      maxlength={MAX_OUTLIER_CHARS}
                      placeholder="Paste an outlier post…"
                    ></textarea>
                    <span class="pf-outlier-status pf-when-empty">
                      {index < MIN_OUTLIERS ? "Needed — two is enough" : "Optional — two is enough"}
                    </span>
                    <span class="pf-outlier-status pf-when-filled">
                      Format will be extracted at run time
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The form element itself carries nothing: every control that belongs
            to it sits in the cards above, associated by `form={RUN_FORM}`. */}
        <form id={RUN_FORM} method="post" action="/runs" class="pf-cta">
          <div>
            <p class="pf-cta-title">Ready to draft</p>
            <p class="pf-cta-sub">
              {ready
                ? `${shortTitle(selected.title)} · ${MIN_OUTLIERS} or ${OUTLIER_FIELDS.length} outliers · ${samples.length} voice samples`
                : "Import a transcript before starting a run."}
            </p>
          </div>
          <button type="submit" class="pf-cta-btn" disabled={!ready}>
            Draft three posts
          </button>
        </form>
      </section>
    </Layout>,
  );
});

sources.post("/sources/samples", async (c) => {
  const form = await c.req.parseBody();
  const raw = form["body"];
  const body = (typeof raw === "string" ? raw : "").trim();

  if (body.length === 0) {
    return c.text("Paste some text", 400);
  }
  if (body.length > MAX_SAMPLE_LENGTH) {
    return c.text(`Sample must be ${MAX_SAMPLE_LENGTH} characters or fewer`, 400);
  }

  await insertVoiceSample(c.env.DB, body);
  return c.redirect("/sources?saved=1", 303);
});

sources.get("/sources/transcripts/:id", async (c) => {
  const id = c.req.param("id");
  if (!TRANSCRIPT_ID_PATTERN.test(id)) {
    return c.text("Invalid transcript id", 400);
  }

  const transcript = await getTranscript(c.env.DB, id);
  if (!transcript) {
    return c.text("Transcript not found", 404);
  }

  const lines = transcript.body.split("\n");

  return c.html(
    <Layout title={`Pipeflick — ${transcript.title}`} path={c.req.path}>
      <section>
        <span class="tag tag-accent tag-12">Transcript</span>
        <h1 class="pf-h1" style="font-size:clamp(28px,3.4vw,44px);max-width:24ch">
          {transcript.title}
        </h1>
        <p class="pf-lede" style="font-size:17px">
          {`${formatDate(transcript.meeting_date)} · ${Math.round(transcript.duration_minutes)} min · ${transcript.line_count} lines kept for ${transcript.speaker_label}`}
        </p>
        <div class="pf-card" style="margin-top:var(--space-4);max-width:70ch">
          <div class="transcript-body">
            {lines.map((line) => (
              <p>{line}</p>
            ))}
          </div>
        </div>
        <p style="margin-top:var(--space-4)">
          <a href="/sources">Back to sources</a>
        </p>
      </section>
    </Layout>,
  );
});
