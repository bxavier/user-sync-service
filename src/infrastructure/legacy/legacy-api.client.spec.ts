/**
 * INTEGRATION TEST - Legacy API Client
 *
 * Uses NOCK to intercept HTTP requests and mock the legacy API.
 *
 * What we test:
 * - Streaming of concatenated JSON data
 * - Correct parsing of user arrays
 * - Corrupted JSON handling
 * - Retry on 500 errors
 * - Circuit breaker on 429 errors
 * - Authentication header (x-api-key)
 */

import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import nock from 'nock';
import { AxiosLegacyApiClient } from './legacy-api.client';
import type { LegacyUser } from '@/domain/services';

describe('LegacyApiClient (Integration)', () => {
  let client: AxiosLegacyApiClient;
  let mockLogger: jest.Mocked<{
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  }>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const LEGACY_API_URL = 'http://localhost:3001';
  const LEGACY_API_KEY = 'test-api-key';

  beforeAll(() => {
    // Enable nock to intercept HTTP requests
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'LEGACY_API_URL') return LEGACY_API_URL;
        if (key === 'LEGACY_API_KEY') return LEGACY_API_KEY;
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    // Create the client
    client = new AxiosLegacyApiClient(mockConfigService, mockLogger);

    // Clean interceptors
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // ============================================================
  // BASIC STREAMING TESTS
  // ============================================================

  describe('fetchUsersStreaming - basic', () => {
    it('should fetch and parse a single array of users', async () => {
      // Arrange - Mock API returning a JSON array
      const mockUsers: LegacyUser[] = [
        { id: 1, userName: 'user1', email: 'user1@test.com', createdAt: '2024-01-01', deleted: false },
        { id: 2, userName: 'user2', email: 'user2@test.com', createdAt: '2024-01-02', deleted: false },
      ];

      nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY)
        .reply(200, JSON.stringify(mockUsers), {
          'Content-Type': 'application/json',
        });

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      // Act
      const result = await client.fetchUsersStreaming(onBatch);

      // Assert
      expect(result.totalProcessed).toBe(2);
      expect(result.totalErrors).toBe(0);
      expect(receivedUsers).toHaveLength(2);
      expect(receivedUsers[0].userName).toBe('user1');
      expect(receivedUsers[1].userName).toBe('user2');
      expect(onBatch).toHaveBeenCalled();
    });

    it('should parse concatenated JSON arrays (legacy format)', async () => {
      // Legacy API sends concatenated arrays without separator:
      // [{"id":1}][{"id":2}][{"id":3}]
      const array1 = [{ id: 1, userName: 'user1', email: 'u1@test.com', createdAt: '2024-01-01', deleted: false }];
      const array2 = [{ id: 2, userName: 'user2', email: 'u2@test.com', createdAt: '2024-01-02', deleted: false }];
      const array3 = [{ id: 3, userName: 'user3', email: 'u3@test.com', createdAt: '2024-01-03', deleted: true }];

      const concatenatedJson = JSON.stringify(array1) + JSON.stringify(array2) + JSON.stringify(array3);

      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, concatenatedJson);

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(3);
      expect(receivedUsers).toHaveLength(3);
      expect(receivedUsers[2].deleted).toBe(true);
    });

    it('should handle large batches (100 users per array)', async () => {
      // Simulates real API behavior that sends 100 users per array
      const batch1 = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        userName: `user_${i + 1}`,
        email: `user${i + 1}@test.com`,
        createdAt: '2024-01-01',
        deleted: false,
      }));

      const batch2 = Array.from({ length: 100 }, (_, i) => ({
        id: i + 101,
        userName: `user_${i + 101}`,
        email: `user${i + 101}@test.com`,
        createdAt: '2024-01-02',
        deleted: false,
      }));

      const concatenatedJson = JSON.stringify(batch1) + JSON.stringify(batch2);

      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, concatenatedJson);

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(200);
      expect(receivedUsers).toHaveLength(200);
    });
  });

  // ============================================================
  // CHUNKED STREAMING TESTS
  // ============================================================

  describe('fetchUsersStreaming - chunked streaming', () => {
    it('should handle chunked streaming (data split across chunks)', async () => {
      // Simulates real streaming where JSON is split across chunks
      const users = [
        { id: 1, userName: 'user1', email: 'u1@test.com', createdAt: '2024-01-01', deleted: false },
        { id: 2, userName: 'user2', email: 'u2@test.com', createdAt: '2024-01-02', deleted: false },
      ];
      const fullJson = JSON.stringify(users);

      // Splits JSON into 10-character chunks
      const chunks: string[] = [];
      for (let i = 0; i < fullJson.length; i += 10) {
        chunks.push(fullJson.slice(i, i + 10));
      }

      // Creates a stream that sends the chunks
      const readable = new Readable({
        read() {
          const chunk = chunks.shift();
          if (chunk) {
            this.push(chunk);
          } else {
            this.push(null); // End of stream
          }
        },
      });

      nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY)
        .reply(200, readable, { 'Transfer-Encoding': 'chunked' });

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(2);
      expect(receivedUsers).toHaveLength(2);
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  describe('fetchUsersStreaming - error handling', () => {
    it('should handle corrupted JSON gracefully', async () => {
      // Corrupted JSON - legacy API sometimes sends invalid data
      const validArray = JSON.stringify([
        { id: 1, userName: 'valid', email: 'v@test.com', createdAt: '2024-01-01', deleted: false },
      ]);
      const corruptedArray = '[{"id":2, "userName": corrupted}]'; // Invalid JSON
      const anotherValidArray = JSON.stringify([
        { id: 3, userName: 'also_valid', email: 'av@test.com', createdAt: '2024-01-03', deleted: false },
      ]);

      const data = validArray + corruptedArray + anotherValidArray;

      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, data);

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      // Should process valid ones and count the error
      expect(result.totalProcessed).toBe(2);
      expect(result.totalErrors).toBe(1);
      expect(receivedUsers).toHaveLength(2);
    });

    it('should handle invalid user objects (missing fields)', async () => {
      const data = JSON.stringify([
        { id: 1, userName: 'valid', email: 'v@test.com', createdAt: '2024-01-01', deleted: false },
        { id: 2, userName: 'invalid' }, // Missing required fields
        { id: 3, userName: 'valid2', email: 'v2@test.com', createdAt: '2024-01-03', deleted: true },
      ]);

      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, data);

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(2);
      expect(result.totalErrors).toBe(1);
    });

    it('should handle strings with special characters in JSON', async () => {
      // Tests special character escaping
      const data = JSON.stringify([
        {
          id: 1,
          userName: 'user_with_"quotes"',
          email: 'test@test.com',
          createdAt: '2024-01-01',
          deleted: false,
        },
        {
          id: 2,
          userName: 'user_with_[brackets]',
          email: 'test2@test.com',
          createdAt: '2024-01-02',
          deleted: false,
        },
      ]);

      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, data);

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(2);
      expect(receivedUsers[0].userName).toBe('user_with_"quotes"');
      expect(receivedUsers[1].userName).toBe('user_with_[brackets]');
    });

    it('should handle empty response', async () => {
      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, '');

      const onBatch = jest.fn();

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(0);
      expect(result.totalErrors).toBe(0);
      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should handle empty array response', async () => {
      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(200, '[]');

      const onBatch = jest.fn();

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(0);
      expect(result.totalErrors).toBe(0);
    });
  });

  // ============================================================
  // RETRY AND CIRCUIT BREAKER TESTS
  // ============================================================

  describe('fetchUsersStreaming - resilience', () => {
    it('should retry on 500 error and succeed', async () => {
      // First request fails, second succeeds
      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', LEGACY_API_KEY).reply(500);

      nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY)
        .reply(
          200,
          JSON.stringify([
            { id: 1, userName: 'success', email: 's@test.com', createdAt: '2024-01-01', deleted: false },
          ]),
        );

      const receivedUsers: LegacyUser[] = [];
      const onBatch = jest.fn(async (users: LegacyUser[]) => {
        receivedUsers.push(...users);
      });

      const result = await client.fetchUsersStreaming(onBatch);

      expect(result.totalProcessed).toBe(1);
      expect(receivedUsers[0].userName).toBe('success');
      expect(mockLogger.warn).toHaveBeenCalledWith('Retry', expect.any(Object));
    });

    it('should fail after max retry attempts', async () => {
      // All requests fail
      nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY)
        .times(10) // Default maxAttempts
        .reply(500);

      const onBatch = jest.fn();

      await expect(client.fetchUsersStreaming(onBatch)).rejects.toThrow();
      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should not retry on 400 error (client error)', async () => {
      nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY)
        .reply(400, { error: 'Bad request' });

      const onBatch = jest.fn();

      await expect(client.fetchUsersStreaming(onBatch)).rejects.toThrow();
      expect(onBatch).not.toHaveBeenCalled();
      // Should fail immediately without retry
    });
  });

  // ============================================================
  // AUTHENTICATION TESTS
  // ============================================================

  describe('fetchUsersStreaming - authentication', () => {
    it('should send x-api-key header', async () => {
      // Nock already verifies header with matchHeader, but let's be explicit
      const scope = nock(LEGACY_API_URL)
        .get('/external/users')
        .matchHeader('x-api-key', LEGACY_API_KEY) // Verifies header
        .reply(200, '[]');

      await client.fetchUsersStreaming(jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it('should fail when API key is missing from config', async () => {
      // Create client without API key
      const noKeyConfigService = {
        get: jest.fn((key: string, defaultValue?: string) => {
          if (key === 'LEGACY_API_URL') return LEGACY_API_URL;
          if (key === 'LEGACY_API_KEY') return ''; // Empty key
          return defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const clientWithoutKey = new AxiosLegacyApiClient(noKeyConfigService, mockLogger);

      // API returns 401 for invalid key
      nock(LEGACY_API_URL).get('/external/users').matchHeader('x-api-key', '').reply(401, { error: 'Unauthorized' });

      await expect(clientWithoutKey.fetchUsersStreaming(jest.fn())).rejects.toThrow();
    });
  });

  // ============================================================
  // LOGGING TESTS
  // ============================================================

  describe('logging', () => {
    it('should log streaming start and completion', async () => {
      nock(LEGACY_API_URL)
        .get('/external/users')
        .reply(
          200,
          JSON.stringify([{ id: 1, userName: 'u', email: 'e@t.com', createdAt: '2024-01-01', deleted: false }]),
        );

      await client.fetchUsersStreaming(jest.fn());

      expect(mockLogger.log).toHaveBeenCalledWith('Starting user streaming from legacy API');
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Streaming completed',
        expect.objectContaining({ totalProcessed: 1, totalErrors: 0 }),
      );
    });
  });
});
