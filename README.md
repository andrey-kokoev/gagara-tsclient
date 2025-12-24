# gagara-tsclient

**gagara-tsclient** is a TypeScript client library for [gagara](https://github.com/your-org/gagara) — an ephemeral, capability-based analytical microservice powered by DuckDB. It allows you to upload data, run SQL queries, and manage datasets directly from your TypeScript applications.

## 🚀 Quick Start

### Installation

Install the client using npm:

```bash
npm install gagara-tsclient
```

### Basic Usage

Here's a simple example of how to use the client:

```typescript
import { GagaraClient } from 'gagara-tsclient';
import { readFile } from 'fs/promises';

async function example() {
  // Create a client instance
  const client = new GagaraClient({
    baseUrl: 'https://gagara.example.com' // Replace with your gagara server URL
  });

  // Upload a CSV file
  const csvData = await readFile('sales.csv');
  const dataset = await client.upload(csvData, 'sales-2024');

  // Query your data using SQL
  const results = await dataset.query<{ region: string; total: number }>(
    'SELECT region, SUM(amount) as total FROM dataset GROUP BY region'
  );

  console.log(results);
  // Output: [{ region: 'North', total: 50000 }, { region: 'South', total: 42000 }]

  // Clean up when done
  await dataset.delete();
}
```

## 🛠️ API Overview

### GagaraClient

The main client class for interacting with the gagara server.

#### Creating a Client

```typescript
const client = new GagaraClient({
  baseUrl: string,      // Required: Your gagara server URL
  fetch?: typeof fetch, // Optional: Custom fetch implementation
  timeout?: number,     // Optional: Request timeout in milliseconds (default: 30000)
});
```

#### Client Methods

- **`upload(data, name, options?)`** → Uploads data and returns a dataset handle
- **`fromToken(token)`** → Reconnects to an existing dataset using a stored token
- **`health()`** → Checks if the server is reachable

### Dataset

Returned by `upload()` or `fromToken()`. Represents your uploaded data.

#### Query Methods

- **`query<T>(sql)`** → Executes SQL and returns rows
- **`queryFull<T>(sql)`** → Returns full response including column names

#### Dataset Information

- **`schema()`** → Gets column metadata (names, types, nullability)
- **`meta()`** → Gets dataset metadata (row count, file size, etc.)
- **`isPresent()`** → Checks if dataset still exists on the server

#### Dataset Management

- **`rename(newName)`** → Updates the dataset's friendly name
- **`delete()`** → Removes the dataset from the server

## 🔧 Advanced Usage

### Storing Dataset Tokens

Since gagara is ephemeral (data is lost on server restart), you might want to store dataset tokens for later use:

```typescript
// Upload and store token
const dataset = await client.upload(data, 'important-data');
await redis.set('my-dataset-token', dataset.token);

// Later, reconnect to the same dataset
const token = await redis.get('my-dataset-token');
const dataset = client.fromToken(token);

// Always check if the dataset still exists
if (!(await dataset.isPresent())) {
  // Dataset was lost, need to re-upload
}
```

### Error Handling

The client provides specific error types for different scenarios:

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
    // Dataset no longer exists (token expired or server restarted)
    console.log('Dataset gone, need to re-upload');
  } else if (err instanceof QueryError) {
    // SQL query error
    console.log('SQL error:', err.body?.error);
  } else if (err instanceof GagaraError) {
    // Other API error
    console.log(`Error ${err.status}: ${err.message}`);
  }
}
```

### Working with Different Data Formats

You can upload different types of data:

```typescript
// Upload CSV data
const csvBuffer = new TextEncoder().encode('id,name\n1,Alice\n2,Bob');
const csvDataset = await client.upload(csvBuffer, 'users', { format: 'csv' });

// Upload Parquet data
const parquetBuffer = await readFile('data.parquet');
const parquetDataset = await client.upload(parquetBuffer, 'analytics', { format: 'parquet' });
```

## 🧪 Testing

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

## ⚠️ Important Notes

- **Ephemeral Nature**: gagara stores everything in memory. All data is lost when the server restarts.
- **SQL Dialect**: Uses DuckDB SQL, which supports CTEs, window functions, JSON operations, and more.
- **Table Name**: Always use `dataset` as the table name in your SQL queries — it's a view to your uploaded data.
- **Large Values**: `HUGEINT` values outside the i64 range are returned as strings.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

MIT License