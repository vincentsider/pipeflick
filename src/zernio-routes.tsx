import { Hono } from "hono";
import type { AppEnv } from "./access";
import { getSetting, setSetting, ZERNIO_ACCOUNT_ID_KEY, ZERNIO_ACCOUNT_LABEL_KEY } from "./db";
import { Layout } from "./layout";
import { listLinkedInAccounts, ZernioError, type ZernioAccount } from "./zernio";

/**
 * Zernio connection page, and the one place the LinkedIn account is chosen.
 *
 * `GET /zernio` answers two questions with a single request: does the key work,
 * and which LinkedIn account would a push post as. Zernio has no `/me`
 * endpoint, so the account list is the connection check — the same shape as
 * `/fireflies`, which gets the key owner and the meeting page together.
 *
 * This file is the only place that reads the `ZERNIO_USER_TOKEN` binding. The
 * client (`src/zernio.ts`) takes the key as an argument and never reads the
 * environment, which is what keeps the publishing boundary to one file.
 *
 * Nothing here publishes anything: the only Zernio call in this file is a GET.
 */

/**
 * Zernio account ids are 24-character hex ObjectIds (OpenAPI spec). Shape is
 * checked before D1 is touched; the submitted id is then checked against the
 * ids Zernio just listed, because a form field is not evidence.
 */
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function ErrorPage({ children }: { children: string }) {
  return (
    <Layout title="Pipeflick — Zernio" path="/zernio">
      <h2>Zernio</h2>
      <p class="notice error">{children}</p>
      <p>
        <a href="/zernio">Try again</a>
      </p>
    </Layout>
  );
}

/** A 401 means the secret is set and wrong, which is a different afternoon. */
function BadKeyPage({ error }: { error: ZernioError }) {
  return (
    <Layout title="Pipeflick — Zernio" path="/zernio">
      <h2>Zernio</h2>
      <p class="notice error">{`Zernio connection failed: ${error.message} (code ${error.code})`}</p>
      <p class="notice error">
        ZERNIO_USER_TOKEN is set, but Zernio rejected it, so the value it holds is not a valid
        Zernio API key. A Zernio API key is "sk_" followed by 64 hex characters and is created in
        the Zernio dashboard under API keys. Put the right value in .dev.vars and run
        "npm run secrets:push".
      </p>
      <p>
        <a href="/health">Check which secrets are set</a>
      </p>
    </Layout>
  );
}

/** What a human calls this account; ids are never shown as a name. */
function accountLabel(account: ZernioAccount): string {
  return account.displayName || account.username || account.id;
}

/**
 * Observed on the real account list: Zernio's LinkedIn `username` is the
 * person's name, not a handle, so it is often identical to `displayName` —
 * "Vincent Sider (@Vincent Sider)" is what an unconditional suffix renders.
 * The handle is only shown when it says something the name does not.
 */
function accountLine(account: ZernioAccount): string {
  const label = accountLabel(account);
  return account.username === "" || account.username === label
    ? label
    : `${label} (@${account.username})`;
}

function AccountChoice({ account, checked }: { account: ZernioAccount; checked: boolean }) {
  const id = `account-${account.id}`;
  return (
    <li>
      <label for={id}>
        <input
          type="radio"
          id={id}
          name="account_id"
          value={account.id}
          checked={checked}
        />{" "}
        {accountLine(account)}
      </label>
      {account.isActive ? (
        ""
      ) : (
        <p class="hint">
          Zernio reports this account as not active — reconnect it in the Zernio dashboard before
          pushing to it.
        </p>
      )}
    </li>
  );
}

function ConnectionPage({
  accounts,
  storedId,
  storedLabel,
  saved,
}: {
  accounts: ZernioAccount[];
  storedId: string;
  storedLabel: string;
  saved: boolean;
}) {
  const stored = accounts.find((account) => account.id === storedId) ?? null;

  return (
    <Layout title="Pipeflick — Zernio" path="/zernio">
      <h2>Zernio</h2>

      {saved ? <p class="notice">Saved.</p> : ""}

      {accounts.length === 0 ? (
        <>
          <p class="notice">Connected to Zernio.</p>
          <p class="notice warn">
            No LinkedIn account is connected inside Zernio, so there is nowhere to push a draft yet.
            Connect one in the Zernio dashboard under Accounts → Connect → LinkedIn, then reload
            this page.
          </p>
        </>
      ) : (
        <>
          <p class="notice">
            {accounts.length === 1
              ? "Connected to Zernio — 1 LinkedIn account on this key."
              : `Connected to Zernio — ${accounts.length} LinkedIn accounts on this key.`}
          </p>

          {storedId !== "" && stored === null ? (
            <p class="notice warn">
              {`The account saved earlier (${storedLabel || storedId}) is no longer in this list, so it was probably disconnected in Zernio. Choose one below — a push to an id this key no longer owns is rejected by Zernio.`}
            </p>
          ) : (
            ""
          )}

          <form method="post" action="/zernio">
            <ul class="speakers">
              {accounts.map((account) => (
                <AccountChoice account={account} checked={account.id === storedId} />
              ))}
            </ul>
            <p>
              <button type="submit">Use this account</button>
            </p>
          </form>

          <p class="hint">
            An approved draft is saved to this account as a draft inside Zernio. Nothing is ever
            published from Pipeflick.
          </p>
        </>
      )}
    </Layout>
  );
}

export const zernio = new Hono<AppEnv>();

/** No key: say so, point at /health, and make no request. */
function missingKeyPage() {
  return <ErrorPage>ZERNIO_USER_TOKEN is not set (see /health)</ErrorPage>;
}

/** Zernio's own message and code, never a stack. 401 gets the extra page. */
function zernioErrorPage(error: ZernioError) {
  return error.status === 401 ? (
    <BadKeyPage error={error} />
  ) : (
    <ErrorPage>{`Zernio connection failed: ${error.message} (code ${error.code})`}</ErrorPage>
  );
}

zernio.get("/zernio", async (c) => {
  const apiKey = c.env.ZERNIO_USER_TOKEN;
  if (!apiKey) {
    return c.html(missingKeyPage(), 500);
  }

  let accounts: ZernioAccount[];
  try {
    // The connection check and the account list are the same request.
    accounts = await listLinkedInAccounts(apiKey);
  } catch (error) {
    if (error instanceof ZernioError) {
      return c.html(zernioErrorPage(error), 502);
    }
    return c.html(<ErrorPage>Zernio request failed</ErrorPage>, 502);
  }

  const storedId = (await getSetting(c.env.DB, ZERNIO_ACCOUNT_ID_KEY)) ?? "";
  const storedLabel = (await getSetting(c.env.DB, ZERNIO_ACCOUNT_LABEL_KEY)) ?? "";

  return c.html(
    <ConnectionPage
      accounts={accounts}
      storedId={storedId}
      storedLabel={storedLabel}
      saved={c.req.query("saved") === "1"}
    />,
  );
});

zernio.post("/zernio", async (c) => {
  const apiKey = c.env.ZERNIO_USER_TOKEN;
  if (!apiKey) {
    return c.html(missingKeyPage(), 500);
  }

  const form = await c.req.parseBody();
  const raw = form["account_id"];
  const accountId = typeof raw === "string" ? raw.trim() : "";
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return c.text("Invalid account id", 400);
  }

  // The form says which account; Zernio says which accounts exist. Only the
  // second is trusted, so a stale or edited form cannot store an id this key
  // does not own — that would fail later, on a push, with a Zernio 403.
  let accounts: ZernioAccount[];
  try {
    accounts = await listLinkedInAccounts(apiKey);
  } catch (error) {
    if (error instanceof ZernioError) {
      return c.html(zernioErrorPage(error), 502);
    }
    return c.html(<ErrorPage>Zernio request failed</ErrorPage>, 502);
  }

  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    return c.text("That account is not connected to this Zernio key", 400);
  }

  await setSetting(c.env.DB, ZERNIO_ACCOUNT_ID_KEY, account.id);
  // Stored so a run page can name the target without spending a request.
  await setSetting(c.env.DB, ZERNIO_ACCOUNT_LABEL_KEY, accountLabel(account));

  return c.redirect("/zernio?saved=1", 303);
});
