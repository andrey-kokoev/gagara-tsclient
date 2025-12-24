import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GagaraClient, Dataset, DatasetNotFoundError, QueryError } from '../src/index.js'

// Mock fetch for testing
function createMockFetch (responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.href
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    const key = `${method} ${path}`

    const response = responses[key]
    if (!response) {
      throw new Error(`No mock for: ${key}`)
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as Response
  })
}

describe('GagaraClient', () => {
  describe('upload', () => {
    it('should upload data and return a Dataset', async () => {
      const mockFetch = createMockFetch({
        'POST /catalog': { status: 200, body: { token: 'abc123' } },
      })

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: mockFetch,
      })

      const data = new TextEncoder().encode('id,name\n1,Alice\n2,Bob')
      const dataset = await client.upload(data, 'users')

      expect(dataset).toBeInstanceOf(Dataset)
      expect(dataset.token).toBe('abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://gagara.test/catalog',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Gagara-Name': 'users',
            'X-Gagara-Format': 'csv',
          },
        })
      )
    })

    it('should pass format option', async () => {
      const mockFetch = createMockFetch({
        'POST /catalog': { status: 200, body: { token: 'xyz789' } },
      })

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: mockFetch,
      })

      const data = new Uint8Array([0x50, 0x41, 0x52, 0x31]) // parquet magic
      await client.upload(data, 'data', { format: 'parquet' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gagara.test/catalog',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Gagara-Format': 'parquet',
          }),
        })
      )
    })
  })

  describe('fromToken', () => {
    it('should create a Dataset without network call', () => {
      const client = new GagaraClient({ baseUrl: 'https://gagara.test' })
      const dataset = client.fromToken('existing-token')

      expect(dataset).toBeInstanceOf(Dataset)
      expect(dataset.token).toBe('existing-token')
    })
  })

  describe('health', () => {
    it('should return true when server is healthy', async () => {
      const mockFetch = createMockFetch({
        'GET /health': { status: 200, body: { status: 'ok' } },
      })

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: mockFetch,
      })

      expect(await client.health()).toBe(true)
    })

    it('should return false when server is unreachable', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: mockFetch,
      })

      expect(await client.health()).toBe(false)
    })
  })
})

describe('Dataset', () => {
  let mockFetch: ReturnType<typeof createMockFetch>
  let dataset: Dataset

  beforeEach(() => {
    mockFetch = createMockFetch({
      'POST /query': {
        status: 200,
        body: {
          columns: ['id', 'name'],
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
        },
      },
      'GET /catalog/test-token/schema': {
        status: 200,
        body: {
          columns: [
            { name: 'id', data_type: 'BIGINT', nullable: false },
            { name: 'name', data_type: 'VARCHAR', nullable: true },
          ],
        },
      },
      'GET /catalog/test-token/meta': {
        status: 200,
        body: {
          row_count: 1000,
          file_size_bytes: 50000,
          columns: [
            { name: 'id', size_bytes: 8000 },
            { name: 'name', size_bytes: 42000 },
          ],
        },
      },
      'GET /catalog/test-token/is-present': {
        status: 200,
        body: { isPresent: true },
      },
      'POST /catalog/test-token/rename': { status: 204, body: null },
      'DELETE /catalog/test-token': { status: 204, body: null },
    })

    const client = new GagaraClient({
      baseUrl: 'https://gagara.test',
      fetch: mockFetch,
    })
    dataset = client.fromToken('test-token')
  })

  describe('query', () => {
    it('should execute query and return rows', async () => {
      const rows = await dataset.query<{ id: number; name: string }>(
        'SELECT * FROM dataset'
      )

      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual({ id: 1, name: 'Alice' })
    })

    it('should include authorization header', async () => {
      await dataset.query('SELECT 1')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gagara.test/query',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })
  })

  describe('queryFull', () => {
    it('should return columns and rows', async () => {
      const result = await dataset.queryFull('SELECT * FROM dataset')

      expect(result.columns).toEqual(['id', 'name'])
      expect(result.rows).toHaveLength(2)
    })
  })

  describe('schema', () => {
    it('should return column definitions', async () => {
      const schema = await dataset.schema()

      expect(schema).toHaveLength(2)
      expect(schema[0]).toEqual({
        name: 'id',
        data_type: 'BIGINT',
        nullable: false,
      })
    })
  })

  describe('meta', () => {
    it('should return dataset metadata', async () => {
      const meta = await dataset.meta()

      expect(meta.row_count).toBe(1000)
      expect(meta.file_size_bytes).toBe(50000)
      expect(meta.columns).toHaveLength(2)
    })
  })

  describe('isPresent', () => {
    it('should return presence status', async () => {
      expect(await dataset.isPresent()).toBe(true)
    })
  })

  describe('rename', () => {
    it('should send rename request', async () => {
      await dataset.rename('new-name')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gagara.test/catalog/test-token/rename',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ new_name: 'new-name' }),
        })
      )
    })
  })

  describe('delete', () => {
    it('should send delete request', async () => {
      await dataset.delete()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gagara.test/catalog/test-token',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('error handling', () => {
    it('should throw DatasetNotFoundError on 404', async () => {
      const notFoundFetch = createMockFetch({
        'POST /query': { status: 404, body: { error: 'unknown token' } },
      })

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: notFoundFetch,
      })
      const ds = client.fromToken('missing')

      await expect(ds.query('SELECT 1')).rejects.toThrow(DatasetNotFoundError)
    })

    it('should throw QueryError on bad SQL', async () => {
      const badQueryFetch = createMockFetch({
        'POST /query': { status: 400, body: { error: 'syntax error at position 0' } },
      })

      const client = new GagaraClient({
        baseUrl: 'https://gagara.test',
        fetch: badQueryFetch,
      })
      const ds = client.fromToken('test')

      await expect(ds.query('SELEKT *')).rejects.toThrow(QueryError)
    })
  })
})
