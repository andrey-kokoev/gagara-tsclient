# gagara-tsclient

TypeScript client for [gagara](https://github.com/your-org/gagara) — an ephemeral, capability-based analytical microservice powered by DuckDB.

## Installation

```bash
npm install gagara-tsclient
```

## Quick Start

```typescript
import { GagaraClient } from 'gagara-tsclient';
import { readFile } from 'fs/promises';

// Create client
const client = new GagaraClient({ 
  baseUrl: 'https://gagara.example.com' 
});

// Upload a CSV
const csvData = await readFile('sales.csv');
const dataset = await client.upload(csvData, 'sales-2024');

// Query using SQL (always use `dataset` as table name)
const results = await dataset.query<{ region: string; total: number }>(
  'SELECT region, SUM(amount) as total FROM dataset GROUP BY region'
);

console.log(results);
// [{ region: 'North', total: 50000 }, { region: 'South', total: 42000 }]

// Clean up when done
await dataset.delete();
```

## API

### `GagaraClient`

```typescript
const client = new GagaraClient({
  baseUrl: string,      // Required: gagara server URL
  fetch?: typeof fetch, // Optional: custom fetch implementation
  timeout?: number,     // Optional: request timeout in ms (default: 30000)
});
```

#### Methods

- **`upload(data, name, options?)`** → `Promise<Dataset>`  
  Upload data and get a dataset handle.
  
  ```typescript
  const ds = await client.upload(buffer, 'my-data', { format: 'parquet' });
  ```

- **`fromToken(token)`** → `Dataset`  
  Reconnect to an existing dataset using a stored token.
  
  ```typescript
  const ds = client.fromToken('abc123...');
  ```

- **`health()`** → `Promise<boolean>`  
  Check if the server is reachable.

### `Dataset`

Returned by `upload()` or `fromToken()`. Carries the capability token.

#### Properties

- **`token: string`** — The capability token for this dataset

#### Query Methods

- **`query<T>(sql)`** → `Promise<T[]>`  
  Execute SQL and get rows. Use `dataset` as the table name.
  
  ```typescript
  const rows = await ds.query<{ id: number; name: string }>(
    'SELECT id, name FROM dataset WHERE active = true'
  );
  ```

- **`queryFull<T>(sql)`** → `Promise<QueryResponse<T>>`  
  Get full response including column names.
  
  ```typescript
  const { columns, rows } = await ds.queryFull('SELECT * FROM dataset');
  ```

#### Introspection

- **`schema()`** → `Promise<SchemaColumn[]>`  
  Get column metadata.
  
  ```typescript
  const cols = await ds.schema();
  // [{ name: 'id', data_type: 'BIGINT', nullable: false }, ...]
  ```

- **`meta()`** → `Promise<MetaResponse>`  
  Get row count, file size, and column sizes.
  
  ```typescript
  const { row_count, file_size_bytes } = await ds.meta();
  ```

- **`isPresent()`** → `Promise<boolean>`  
  Check if dataset still exists (survives server restarts? no).

#### Lifecycle

- **`rename(newName)`** → `Promise<void>`  
  Update the friendly name.

- **`delete()`** → `Promise<void>`  
  Remove dataset from server.

## Error Handling

```typescript
import { 
  GagaraError, 
  DatasetNotFoundError, 
  QueryError 
} from 'gagara-tsclient';

try {
  await dataset.query('SELECT * FROM dataset');
} catch (err) {
  if (err instanceof DatasetNotFoundError) {
    // Token expired or server restarted
    console.log('Dataset gone, need to re-upload');
  } else if (err instanceof QueryError) {
    // Bad SQL
    console.log('SQL error:', err.body?.error);
  } else if (err instanceof GagaraError) {
    // Other API error
    console.log(`Error ${err.status}: ${err.message}`);
  }
}
```

## Usage Patterns

### Persistent Token Storage

```typescript
// Upload and store token
const dataset = await client.upload(data, 'important-data');
await redis.set('my-dataset-token', dataset.token);

// Later, reconnect
const token = await redis.get('my-dataset-token');
const dataset = client.fromToken(token);

// Always check presence after reconnecting (gagara is ephemeral!)
if (!(await dataset.isPresent())) {
  // Need to re-upload
}
```

### Browser Usage

```typescript
// Fetch and upload
const response = await fetch('/api/export.csv');
const data = new Uint8Array(await response.arrayBuffer());
const dataset = await client.upload(data, 'export');

// Query
const results = await dataset.query('SELECT * FROM dataset LIMIT 100');
```

### Type-Safe Queries

```typescript
interface SalesRow {
  date: string;
  product_id: number;
  quantity: number;
  revenue: number;
}

const sales = await dataset.query<SalesRow>(`
  SELECT date, product_id, quantity, revenue 
  FROM dataset 
  WHERE revenue > 1000
`);

// sales is SalesRow[]
sales.forEach(row => {
  console.log(`${row.date}: $${row.revenue}`);
});
```

### Schema-Driven Queries

```typescript
const schema = await dataset.schema();
const numericCols = schema
  .filter(c => ['BIGINT', 'DOUBLE', 'INTEGER'].includes(c.data_type))
  .map(c => c.name);

const stats = await dataset.query(`
  SELECT ${numericCols.map(c => `AVG(${c}) as avg_${c}`).join(', ')}
  FROM dataset
`);
```

## Notes

- **Ephemeral**: gagara stores everything in memory. Server restart = data gone.
- **SQL Dialect**: DuckDB SQL. Supports CTEs, window functions, JSON, etc.
- **Table Name**: Always use `dataset` in your SQL — it's a view to your data.
- **Large Values**: `HUGEINT` values outside i64 range come back as strings.

## Testing

### Unit Tests (with mocks)
Run the existing unit tests with mock HTTP responses:
```bash
npm test
# or
npm run test:unit
```

### End-to-End Tests (with live server)
To run tests against a real gagara server instance:

1. Start your gagara server (typically on port 3039)
2. Set the environment variable and run the end-to-end tests:

```bash
GAGARA_SERVER_URL_TO_TEST_AGAINST="http://localhost:3039" npm run test:e2e
```

The default server URL is `http://localhost:3039` if the environment variable is not set.

## License

Apache-2.0
