// ------------------------------------------------------------
// API Response Types (match gagara server responses)
// ------------------------------------------------------------

export interface CreateDatasetResponse {
  token: string;
}

export interface SchemaColumn {
  name: string;
  data_type: string;
  nullable: boolean;
}

export interface SchemaResponse {
  columns: SchemaColumn[];
}

export interface ColumnSize {
  name: string;
  size_bytes: number;
}

export interface MetaResponse {
  row_count: number;
  file_size_bytes: number;
  columns: ColumnSize[];
}

export interface QueryResponse<T = Record<string, unknown>> {
  columns: string[];
  rows: T[];
}

export interface IsPresentResponse {
  isPresent: boolean;
}

export interface ErrorResponse {
  error: string;
}

// ------------------------------------------------------------
// Client Types
// ------------------------------------------------------------

export type DataFormat = 'csv' | 'parquet';

export interface UploadOptions {
  /** Dataset format. Default: 'csv' */
  format?: DataFormat;
}

export interface ClientOptions {
  /** Base URL of gagara server (no trailing slash) */
  baseUrl: string;
  
  /** Custom fetch implementation (for Node.js <18 or testing) */
  fetch?: typeof globalThis.fetch;
  
  /** Default request timeout in ms. Default: 30000 */
  timeout?: number;
}

// ------------------------------------------------------------
// Error Types
// ------------------------------------------------------------

export class GagaraError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: ErrorResponse
  ) {
    super(message);
    this.name = 'GagaraError';
  }
}

export class DatasetNotFoundError extends GagaraError {
  constructor(token: string) {
    super(`Dataset not found: ${token}`, 404);
    this.name = 'DatasetNotFoundError';
  }
}

export class QueryError extends GagaraError {
  constructor(message: string, body?: ErrorResponse) {
    super(message, 400, body);
    this.name = 'QueryError';
  }
}
