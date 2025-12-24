import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { GagaraClient, Dataset, DatasetNotFoundError, QueryError } from '../src/index.js'

// Environment variable for server URL
const SERVER_URL = 'http://localhost:3039'

describe('GagaraClient - Live Server Tests', () => {
  let client: GagaraClient

  beforeAll(() => {
    client = new GagaraClient({ baseUrl: SERVER_URL })
  })

  describe('upload', () => {
    it('should upload data and return a Dataset', async () => {
      const data = new TextEncoder().encode('id,name\n1,Alice\n2,Bob')
      const dataset = await client.upload(data, 'users')

      expect(dataset).toBeInstanceOf(Dataset)
      expect(dataset.token).toBeDefined()
      expect(typeof dataset.token).toBe('string')
      expect(dataset.token.length).toBeGreaterThan(0)

      // Clean up
      await dataset.delete()
    })

    it('should pass format option', async () => {
      const csvData = new TextEncoder().encode('id,value\n1,100\n2,200')

      // Test with CSV format (since parquet data might not be valid)
      const dataset = await client.upload(csvData, 'data', { format: 'csv' })

      expect(dataset.token).toBeDefined()

      // Clean up
      await dataset.delete()
    })
  })

  describe('fromToken', () => {
    it('should create a Dataset without network call', () => {
      const token = 'existing-token-for-test'
      const dataset = client.fromToken(token)

      expect(dataset).toBeInstanceOf(Dataset)
      expect(dataset.token).toBe(token)
    })
  })

  describe('health', () => {
    it('should return true when server is healthy', async () => {
      const isHealthy = await client.health()
      expect(isHealthy).toBe(true)
    })

    // Note: We can't easily test the "unreachable" case in live server tests
    // since that requires the server to be down during the test
  })
})

describe('Dataset - Live Server Tests', () => {
  let client: GagaraClient
  let dataset: Dataset

  beforeAll(() => {
    client = new GagaraClient({ baseUrl: SERVER_URL })
  })

  beforeEach(async () => {
    // Create a fresh dataset for each test
    const csvData = new TextEncoder().encode('id,name\n1,Alice\n2,Bob\n3,Charlie')
    dataset = await client.upload(csvData, 'test-data')
  })

  afterEach(async () => {
    // Clean up the dataset after each test
    if (dataset) {
      try {
        await dataset.delete()
      } catch {
        // Dataset might have been deleted in the test, ignore errors
      }
    }
  })

  describe('query', () => {
    it('should execute query and return rows', async () => {
      const rows = await dataset.query<{ id: number; name: string }>(
        'SELECT * FROM dataset ORDER BY id'
      )

      expect(rows).toHaveLength(3)
      expect(rows[0]).toEqual({ id: 1, name: 'Alice' })
      expect(rows[1]).toEqual({ id: 2, name: 'Bob' })
      expect(rows[2]).toEqual({ id: 3, name: 'Charlie' })
    })
  })

  describe('queryFull', () => {
    it('should return columns and rows', async () => {
      const result = await dataset.queryFull('SELECT * FROM dataset WHERE id = 1')

      expect(result.columns).toEqual(['id', 'name'])
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' })
    })
  })

  describe('schema', () => {
    it('should return column definitions', async () => {
      const schema = await dataset.schema()

      expect(schema).toHaveLength(2) // id and name columns
      expect(schema[0]).toEqual({
        name: expect.any(String),
        data_type: expect.any(String),
        nullable: expect.any(Boolean),
      })

      const idColumn = schema.find(col => col.name === 'id')
      const nameColumn = schema.find(col => col.name === 'name')

      expect(idColumn).toBeDefined()
      expect(nameColumn).toBeDefined()
    })
  })

  describe('meta', () => {
    it('should return dataset metadata', async () => {
      const meta = await dataset.meta()

      expect(typeof meta.row_count).toBe('number')
      expect(typeof meta.file_size_bytes).toBe('number')
      expect(Array.isArray(meta.columns)).toBe(true)
      expect(meta.row_count).toBeGreaterThan(0)
      expect(meta.file_size_bytes).toBeGreaterThan(0)
    })
  })

  describe('isPresent', () => {
    it('should return presence status', async () => {
      const isPresent = await dataset.isPresent()
      expect(isPresent).toBe(true)
    })
  })

  describe('rename', () => {
    it('should send rename request', async () => {
      await dataset.rename('new-test-name')

      // Verify the rename by checking if the dataset still exists
      const isPresent = await dataset.isPresent()
      expect(isPresent).toBe(true)
    })
  })

  describe('delete', () => {
    it('should send delete request', async () => {
      const token = dataset.token

      await dataset.delete()

      // Verify dataset is deleted by trying to query it
      const deletedDataset = client.fromToken(token)
      await expect(deletedDataset.query('SELECT 1')).rejects.toThrow(DatasetNotFoundError)

      // Don't set to null, let afterEach handle it appropriately
    })
  })

  describe('error handling', () => {
    it('should throw DatasetNotFoundError on 404', async () => {
      const invalidDataset = client.fromToken('invalid-token-that-does-not-exist')

      await expect(invalidDataset.query('SELECT 1')).rejects.toThrow(DatasetNotFoundError)
    })

    it('should throw QueryError on bad SQL', async () => {
      await expect(dataset.query('SELEKT * FROM dataset')).rejects.toThrow(QueryError)
    })
  })
})