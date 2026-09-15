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

/** Pasted samples are single posts or newsletters, not whole archives. */
const MAX_SAMPLE_LENGTH = 20000;
/** Characters of a sample shown before the reader has to expand it. */
const SAMPLE_PREVIEW_LENGTH = 200;
/** Fireflies transcript ids; also guards the detail route against junk. */
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** ISO timestamp to YYYY-MM-DD, falling back to the stored text. */
function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function TranscriptTable({ rows }: { rows: TranscriptSummary[] }) {
  if (rows.length === 0) {
    return (
      <p>
        No transcripts yet. <a href="/fireflies">Import one from Fireflies.</a>
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Meeting</th>
          <th>Date</th>
          <th>Duration</th>
          <th>Speaker</th>
          <th>Lines</th>
          <th>Imported</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            <td>
              <a href={`/sources/transcripts/${row.id}`}>{row.title}</a>
            </td>
            <td>{formatDate(row.meeting_date)}</td>
            <td>{`${Math.round(row.duration_minutes)} min`}</td>
            <td>{row.speaker_label}</td>
            <td>{String(row.line_count)}</td>
            <td>{formatDate(row.imported_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SampleList({ rows }: { rows: VoiceSampleRow[] }) {
  if (rows.length === 0) {
    return <p>No samples yet. Paste a past post above.</p>;
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

  return c.html(
    <Layout title="Pipeflick sources">
      <h2>Sources</h2>
      {saved ? <p class="notice">Sample saved.</p> : ""}

      <h3>Transcripts</h3>
      <TranscriptTable rows={transcripts} />

      <h3>Voice samples</h3>
      <p class="hint">
        Paste a post, newsletter or anything else you wrote yourself. This is the fuel for your
        voice.
      </p>
      <form method="post" action="/sources/samples">
        <p>
          <textarea name="body" rows={8} cols={70} maxlength={MAX_SAMPLE_LENGTH} required></textarea>
        </p>
        <p>
          <button type="submit">Save sample</button>
        </p>
      </form>
      <SampleList rows={samples} />
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
    <Layout title={`Pipeflick — ${transcript.title}`}>
      <h2>{transcript.title}</h2>
      <p class="hint">
        {`${formatDate(transcript.meeting_date)} · ${Math.round(transcript.duration_minutes)} min`}
      </p>
      <p>
        {`Lines kept for speaker: ${transcript.speaker_label} (${transcript.line_count})`}
      </p>
      <div class="transcript-body">
        {lines.map((line) => (
          <p>{line}</p>
        ))}
      </div>
      <p>
        <a href="/sources">Back to sources</a>
      </p>
    </Layout>,
  );
});
