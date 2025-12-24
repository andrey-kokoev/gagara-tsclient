import type {
  SchemaColumn,
  MetaResponse,
  QueryResponse,
  ErrorResponse,
} from './types.js';
import { GagaraError, DatasetNotFoundError, QueryError } from './types.js';

/**
 * Handle to an uploaded dataset. Carries the token and provides
 * methods for querying, introspection, and lifecycle management.
 */
export class Dataset {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeout: number;

  constructor(
    /** Capability token for this dataset */
    public readonly token: string,
    baseUrl: string,
    fetchFn: typeof globalThis.fetch,
    timeout: number
  ) {
    this.#baseUrl = baseUrl;
    this.#fetch = fetchFn;
    this.#timeout = timeout;
  }

  // ----------------------------------------------------------
  // Query
  // ----------------------------------------------------------

  /**
   * Execute a SQL query against this dataset.
   * Use `dataset` as the table name in your SQL.
   *
   * @example
   * const results = await ds.query<{ name: string; count: number }>(
   *   'SELECT name, COUNT(*) as count FROM dataset GROUP BY name'
   * );
   */
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const res = await this.#request('/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ sql }),
    });

    if (!res.ok) {
      const body = await this.#parseError(res);
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new QueryError(body?.error ?? 'Query failed', body);
    }

    const data: QueryResponse<T> = await res.json();
    return data.rows;
  }

  /**
   * Execute a query and return full response including column names.
   */
  async queryFull<T = Record<string, unknown>>(
    sql: string
  ): Promise<QueryResponse<T>> {
    const res = await this.#request('/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ sql }),
    });

    if (!res.ok) {
      const body = await this.#parseError(res);
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new QueryError(body?.error ?? 'Query failed', body);
    }

    return res.json();
  }

  // ----------------------------------------------------------
  // Introspection
  // ----------------------------------------------------------

  /**
   * Get column schema (names, types, nullability).
   */
  async schema(): Promise<SchemaColumn[]> {
    const res = await this.#request(`/catalog/${this.token}/schema`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new GagaraError('Failed to get schema', res.status);
    }

    const data = await res.json();
    return data.columns;
  }

  /**
   * Get dataset metadata: row count, file size, column sizes.
   */
  async meta(): Promise<MetaResponse> {
    const res = await this.#request(`/catalog/${this.token}/meta`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new GagaraError('Failed to get metadata', res.status);
    }

    return res.json();
  }

  /**
   * Check if this dataset still exists on the server.
   * Useful for long-lived tokens across server restarts.
   */
  async isPresent(): Promise<boolean> {
    const res = await this.#request(`/catalog/${this.token}/is-present`);

    if (!res.ok) {
      throw new GagaraError('Failed to check presence', res.status);
    }

    const data = await res.json();
    return data.isPresent;
  }

  // ----------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------

  /**
   * Rename this dataset (updates friendly name only).
   */
  async rename(newName: string): Promise<void> {
    const res = await this.#request(`/catalog/${this.token}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new GagaraError('Failed to rename', res.status);
    }
  }

  /**
   * Delete this dataset from the server.
   * The Dataset object becomes unusable after this.
   */
  async delete(): Promise<void> {
    const res = await this.#request(`/catalog/${this.token}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new DatasetNotFoundError(this.token);
      }
      throw new GagaraError('Failed to delete', res.status);
    }
  }

  // ----------------------------------------------------------
  // Internal
  // ----------------------------------------------------------

  async #request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #parseError(res: Response): Promise<ErrorResponse | undefined> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
}
