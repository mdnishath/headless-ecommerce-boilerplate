const ENDPOINT =
  process.env.WP_GRAPHQL_ENDPOINT ?? "http://ecommerce-backend.local/graphql";

type GraphQLError = { message: string };

/** Server-side GraphQL POST to WordPress with ISR cache tags. */
export async function wpFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  tags: string[] = [],
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { tags, revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`WP GraphQL HTTP ${res.status} at ${ENDPOINT}`);
  }
  const json = (await res.json()) as { data?: T; errors?: GraphQLError[] };
  if (json.errors?.length) {
    throw new Error(`WP GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("WP GraphQL: empty response");
  }
  return json.data;
}
