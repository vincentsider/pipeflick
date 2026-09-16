import { Hono } from "hono";
import type { AppEnv } from "./access";
import { getSetting, SPEAKER_NAME_KEY, upsertTranscript } from "./db";
import {
  fetchTranscript,
  FirefliesError,
  listMeetings,
  PAGE_SIZE,
  type FetchedTranscript,
  type Meeting,
} from "./fireflies";
import { Layout } from "./layout";
import {
  countBySpeaker,
  keepSpeakerLines,
  matchSpeaker,
  UNKNOWN_SPEAKER,
  type SpeakerCount,
} from "./speaker-filter";

/**
 * Fireflies connection, meeting list and speaker-filtered import.
 *
 * Only the selected speaker's sentences are ever written to D1: every write
 * goes through `keepSpeakerLines` (src/speaker-filter.ts), and the sentence
 * array itself is passed to nothing else — not to logging, not to storage,
 * and it never travels through the browser (the confirm step re-fetches).
 */

/** Fireflies transcript ids as they appear in URLs. */
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** `?skip=` offsets we accept; anything else falls back to the first page. */
const SKIP_PATTERN = /^\d{1,5}$/;

/** ISO timestamp to YYYY-MM-DD; "" when Fireflies gave no usable date. */
function formatDate(isoDate: string): string {
  return isoDate === "" ? "unknown date" : isoDate.slice(0, 10);
}

function ErrorPage({ title, children }: { title: string; children: string }) {
  return (
    <Layout title="Pipeflick — Fireflies" path="/fireflies">
      <h2>{title}</h2>
      <p class="notice error">{children}</p>
      <p>
        <a href="/fireflies">Back to meetings</a>
      </p>
    </Layout>
  );
}

/** One speaker on the preview, plus whether the filter would keep any line. */
type PreviewSpeaker = SpeakerCount & { importable: boolean };

function SpeakerChoice({ speaker, checked }: { speaker: PreviewSpeaker; checked: boolean }) {
  const id = `speaker-${speaker.lines}-${speaker.label}`;
  return (
    <li>
      <label for={id}>
        <input
          type="radio"
          id={id}
          name="speaker"
          value={speaker.label}
          checked={checked}
          disabled={!speaker.importable}
        />{" "}
        {`${speaker.label} — ${speaker.lines} lines`}
      </label>
      {speaker.importable ? (
        ""
      ) : (
        <p class="hint">
          {speaker.label === UNKNOWN_SPEAKER
            ? "Fireflies attached no speaker name to these lines, so they cannot be imported on their own."
            : "No lines can be attributed to this label."}
        </p>
      )}
    </li>
  );
}

function ImportPreview({
  meeting,
  speakers,
  configured,
  preselected,
  error,
}: {
  meeting: Meeting;
  speakers: PreviewSpeaker[];
  configured: string;
  preselected: string | null;
  error?: string;
}) {
  return (
    <Layout title={`Pipeflick — import ${meeting.title}`} path="/fireflies">
      <h2>{meeting.title}</h2>
      <p class="hint">{`${formatDate(meeting.dateIso)} · ${meeting.durationMinutes} min`}</p>

      {error ? <p class="notice error">{error}</p> : ""}

      {configured === "" ? (
        <p class="notice">
          No speaker name set. <a href="/settings">Set it</a> to preselect next time.
        </p>
      ) : preselected === null ? (
        <p class="notice">
          {`"${configured}" was not found among the speakers below; pick yourself manually.`}
        </p>
      ) : (
        ""
      )}

      <form method="post" action={`/fireflies/${meeting.id}/import`}>
        <ul class="speakers">
          {speakers.map((speaker) => (
            <SpeakerChoice speaker={speaker} checked={speaker.label === preselected} />
          ))}
        </ul>
        <p>
          <button type="submit">Import only this speaker's lines</button>
        </p>
      </form>
      <p class="hint">
        Only the selected speaker's sentences will be stored. Everything else is discarded.
      </p>
      <p>
        <a href="/fireflies">Back to meetings</a>
      </p>
    </Layout>
  );
}

export const fireflies = new Hono<AppEnv>();

/** Fireflies error to a page; `object_not_found` is the caller's bad id. */
function firefliesErrorPage(error: FirefliesError) {
  return (
    <ErrorPage title="Fireflies">{`Fireflies connection failed: ${error.message} (code ${error.code})`}</ErrorPage>
  );
}

fireflies.get("/fireflies", async (c) => {
  const apiKey = c.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return c.html(
      <ErrorPage title="Fireflies">FIREFLIES_API_KEY is not set (see /health)</ErrorPage>,
      500,
    );
  }

  const rawSkip = c.req.query("skip") ?? "";
  const skip = SKIP_PATTERN.test(rawSkip) ? Number(rawSkip) : 0;

  let user: { name: string; email: string };
  let meetings: Meeting[];
  try {
    // One request: connection check and meeting page together (rate limits).
    ({ user, meetings } = await listMeetings(apiKey, skip));
  } catch (error) {
    if (error instanceof FirefliesError) {
      return c.html(firefliesErrorPage(error), 502);
    }
    return c.html(<ErrorPage title="Fireflies">Fireflies request failed</ErrorPage>, 502);
  }

  return c.html(
    <Layout title="Pipeflick — Fireflies" path="/fireflies">
      <h2>Fireflies</h2>
      <p class="notice">{`Connected as ${user.name} (${user.email})`}</p>

      {meetings.length === 0 ? (
        <p>No meetings on this page.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Meeting</th>
              <th>Date</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((meeting) => (
              <tr>
                <td>{meeting.title}</td>
                <td>{formatDate(meeting.dateIso)}</td>
                <td>{`${meeting.durationMinutes} min`}</td>
                <td>
                  <a href={`/fireflies/${meeting.id}/import`}>Import</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>
        {skip > 0 ? (
          <a href={`/fireflies?skip=${Math.max(0, skip - PAGE_SIZE)}`}>Previous</a>
        ) : (
          ""
        )}{" "}
        {meetings.length === PAGE_SIZE ? (
          <a href={`/fireflies?skip=${skip + PAGE_SIZE}`}>{`Next ${PAGE_SIZE}`}</a>
        ) : (
          ""
        )}
      </p>
    </Layout>,
  );
});

/** Shared preview data for both the GET preview and the 422 re-render. */
async function buildPreview(db: D1Database, transcript: FetchedTranscript) {
  const speakers: PreviewSpeaker[] = countBySpeaker(transcript.sentences).map((speaker) => ({
    ...speaker,
    // Fails closed: a label the filter cannot match (the UNKNOWN_SPEAKER
    // placeholder for blank names) must not be offered as importable.
    importable: keepSpeakerLines(transcript.sentences, speaker.label).length > 0,
  }));
  const configured = (await getSetting(db, SPEAKER_NAME_KEY)) ?? "";
  const matched = matchSpeaker(
    speakers.filter((speaker) => speaker.importable).map((speaker) => speaker.label),
    configured,
  );

  return { speakers, configured, preselected: matched };
}

fireflies.get("/fireflies/:id/import", async (c) => {
  const id = c.req.param("id");
  if (!TRANSCRIPT_ID_PATTERN.test(id)) {
    return c.text("Invalid transcript id", 400);
  }

  const apiKey = c.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return c.html(
      <ErrorPage title="Fireflies">FIREFLIES_API_KEY is not set (see /health)</ErrorPage>,
      500,
    );
  }

  let transcript: FetchedTranscript;
  try {
    transcript = await fetchTranscript(apiKey, id);
  } catch (error) {
    if (error instanceof FirefliesError) {
      return c.html(firefliesErrorPage(error), error.code === "object_not_found" ? 404 : 502);
    }
    return c.html(<ErrorPage title="Fireflies">Fireflies request failed</ErrorPage>, 502);
  }

  const preview = await buildPreview(c.env.DB, transcript);

  return c.html(
    <ImportPreview
      meeting={transcript}
      speakers={preview.speakers}
      configured={preview.configured}
      preselected={preview.preselected}
    />,
  );
});

fireflies.post("/fireflies/:id/import", async (c) => {
  const id = c.req.param("id");
  if (!TRANSCRIPT_ID_PATTERN.test(id)) {
    return c.text("Invalid transcript id", 400);
  }

  const apiKey = c.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return c.html(
      <ErrorPage title="Fireflies">FIREFLIES_API_KEY is not set (see /health)</ErrorPage>,
      500,
    );
  }

  const form = await c.req.parseBody();
  const raw = form["speaker"];
  const speaker = typeof raw === "string" ? raw.trim() : "";
  if (speaker === "") {
    return c.text("Pick a speaker", 400);
  }

  // Re-fetch rather than carrying the other speakers' text through the browser.
  let transcript: FetchedTranscript;
  try {
    transcript = await fetchTranscript(apiKey, id);
  } catch (error) {
    if (error instanceof FirefliesError) {
      return c.html(firefliesErrorPage(error), error.code === "object_not_found" ? 404 : 502);
    }
    return c.html(<ErrorPage title="Fireflies">Fireflies request failed</ErrorPage>, 502);
  }

  // The one gate: everything anyone else said is dropped here.
  const lines = keepSpeakerLines(transcript.sentences, speaker);

  if (lines.length === 0) {
    const preview = await buildPreview(c.env.DB, transcript);
    return c.html(
      <ImportPreview
        meeting={transcript}
        speakers={preview.speakers}
        configured={preview.configured}
        preselected={preview.preselected}
        error={`No lines found for "${speaker}"`}
      />,
      422,
    );
  }

  await upsertTranscript(c.env.DB, {
    id: transcript.id,
    title: transcript.title,
    meeting_date: transcript.dateIso,
    duration_minutes: transcript.durationMinutes,
    speaker_label: speaker,
    body: lines.join("\n"),
    line_count: lines.length,
  });

  return c.redirect(`/sources/transcripts/${transcript.id}`, 303);
});
