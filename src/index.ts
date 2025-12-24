// Main client
export { GagaraClient } from './client.js';

// Dataset handle
export { Dataset } from './dataset.js';

// Types
export type {
  // API responses
  CreateDatasetResponse,
  SchemaColumn,
  SchemaResponse,
  ColumnSize,
  MetaResponse,
  QueryResponse,
  IsPresentResponse,
  ErrorResponse,
  // Client options
  DataFormat,
  UploadOptions,
  ClientOptions,
} from './types.js';

// Errors
export {
  GagaraError,
  DatasetNotFoundError,
  QueryError,
} from './types.js';
