// shared/types/src/index.ts
// Common types shared across all MCP Farm servers

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface McpFarmError {
  code: string;
  message: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export interface AuthConfig {
  type: "basic" | "bearer" | "apikey";
  credentials: Record<string, string>;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  retryOn: number[];
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 500,
  retryOn: [429, 502, 503, 504],
};
