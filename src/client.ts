import { Dataset } from './dataset.js';
import type {
  ClientOptions,
  UploadOptions,
  CreateDatasetResponse,
  ErrorResponse,
} from './types.js';
import { GagaraError } from './types.js';

/**
 * Client for the gagara ephemeral data service.
 *
 * @example
 * ```ts
 * const client = new GagaraClient({ baseUrl: 'https://gagara.example.com' });
 *
 * // Upload a CSV
 * const dataset = await client.upload(csvBuffer, 'sales-data');
 *
 * // Query it
 * const results = await dataset.query('SELECT * FROM dataset LIMIT 10');
 *
 * // Clean up
 * await dataset.delete();
 * ```
 */
export class GagaraClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeout: number;

  constructor(options: ClientOptions) {
    // Strip trailing slash
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeout = options.timeout ?? 30_000;
  }

  /**
   * Upload a dataset and get a handle for querying.
   *
   * @param data - Raw file contents (CSV or Parquet bytes)
   * @param name - Friendly name for the dataset
   * @param options - Upload options (format, etc.)
   * @returns Dataset handle with query methods
   *
   * @example
   * ```ts
   * // From a file (Node.js)
   * import { readFile } from 'fs/promises';
   * const data = await readFile('data.csv');
   * const dataset = await client.upload(data, 'my-data');
   *
   * // From a fetch response (browser)
   * const response = await fetch('/data.parquet');
   * const data = new Uint8Array(await response.arrayBuffer());
   * const dataset = await client.upload(data, 'my-data', { format: 'parquet' });
   * ```
   */
  async upload(
    data: Uint8Array | ArrayBuffer,
    name: string,
    options: UploadOptions = {}
  ): Promise<Dataset> {
    const format = options.format ?? 'csv';
    const body = (data instanceof ArrayBuffer ? new Uint8Array(data) : data) as BodyInit;

    const res = await this.#request('/catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Gagara-Name': name,
        'X-Gagara-Format': format,
      },
      body,
    });

    if (!res.ok) {
      const errorBody = await this.#parseError(res);
      throw new GagaraError(
        errorBody?.error ?? `Upload failed: ${res.status}`,
        res.status,
        errorBody
      );
    }

    const result: CreateDatasetResponse = await res.json();
    return new Dataset(result.token, this.#baseUrl, this.#fetch, this.#timeout);
  }

  /**
   * Reconnect to an existing dataset using a previously obtained token.
   * Useful when you've stored a token and want to resume working with the dataset.
   *
   * Note: This does NOT verify the dataset still exists. Call `isPresent()`
   * on the returned Dataset if you need to check.
   *
   * @param token - Previously obtained dataset token
   * @returns Dataset handle
   *
   * @example
   * ```ts
   * // Store token somewhere...
   * const token = dataset.token;
   *
   * // Later, reconnect
   * const dataset = client.fromToken(token);
   * if (await dataset.isPresent()) {
   *   const results = await dataset.query('SELECT * FROM dataset');
   * }
   * ```
   */
  fromToken(token: string): Dataset {
    return new Dataset(token, this.#baseUrl, this.#fetch, this.#timeout);
  }

  /**
   * Health check - verify the gagara server is reachable.
   */
  async health(): Promise<boolean> {
    try {
      const res = await this.#request('/health');
      return res.ok;
    } catch {
      return false;
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
