// shared/auth/src/index.ts
// Reusable auth helpers for Basic, Bearer, and API Key auth

export function basicAuthHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

export function bearerAuthHeader(token: string): string {
  return `Bearer ${token}`;
}

export function apiKeyHeader(
  key: string,
  headerName = "X-Api-Key"
): Record<string, string> {
  return { [headerName]: key };
}

export function atlassianAuthHeaders(
  email: string,
  apiToken: string
): Record<string, string> {
  return {
    Authorization: basicAuthHeader(email, apiToken),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function splunkAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: bearerAuthHeader(token),
    "Content-Type": "application/json",
  };
}

export function dynatraceAuthHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Api-Token ${apiToken}`,
    "Content-Type": "application/json",
  };
}

export function bmcRemedyAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: token,
    "Content-Type": "application/json",
  };
}
