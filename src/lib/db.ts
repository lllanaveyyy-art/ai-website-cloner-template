import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  client ??= postgres(connectionString, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false
  });

  return client;
}
