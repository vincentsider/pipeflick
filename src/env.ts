/**
 * Names of the Worker secrets the pipeline depends on. Values live only in
 * `.dev.vars` locally (gitignored) and in Worker secrets remotely, never in
 * D1 or committed files. Only presence (set / not set) is ever rendered.
 */
export const SECRET_NAMES = ["OPENAI_API_KEY", "FIREFLIES_API_KEY", "METRICOOL_USER_TOKEN"] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

/** Secret bindings are optional so the code compiles whether or not `.dev.vars` declares them. */
export type SecretBindings = Partial<Record<SecretName, string>>;
