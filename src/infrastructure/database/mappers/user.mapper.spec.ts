import { User } from '@/domain/models';
import type { LegacyUser } from '@/domain/services';
import { UserEntity } from '@/infrastructure/database/entities';
import { UserMapper } from './user.mapper';

describe('UserMapper', () => {
  describe('toDomain', () => {
    it('should convert a complete UserEntity to User domain model', () => {
      const entity: UserEntity = {
        id: 1,
        legacyId: 12345,
        userName: 'john_doe',
        email: 'john@example.com',
        legacyCreatedAt: new Date('2024-01-15T10:00:00Z'),
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-06-15T14:30:00Z'),
        deleted: false,
        deletedAt: null,
      };

      const user = UserMapper.toDomain(entity);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe(1);
      expect(user.legacyId).toBe(12345);
      expect(user.userName).toBe('john_doe');
      expect(user.email).toBe('john@example.com');
      expect(user.legacyCreatedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(user.createdAt).toEqual(new Date('2024-06-01T12:00:00Z'));
      expect(user.updatedAt).toEqual(new Date('2024-06-15T14:30:00Z'));
      expect(user.deleted).toBe(false);
      expect(user.deletedAt).toBeNull();
    });

    it('should convert entity with null legacyId', () => {
      const entity: UserEntity = {
        id: 2,
        legacyId: null,
        userName: 'local_user',
        email: 'local@example.com',
        legacyCreatedAt: null,
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-06-01T12:00:00Z'),
        deleted: false,
        deletedAt: null,
      };

      const user = UserMapper.toDomain(entity);

      expect(user.legacyId).toBeNull();
      expect(user.legacyCreatedAt).toBeNull();
    });

    it('should convert entity with soft delete', () => {
      const deletedAt = new Date('2024-07-01T00:00:00Z');
      const entity: UserEntity = {
        id: 3,
        legacyId: 99999,
        userName: 'deleted_user',
        email: 'deleted@example.com',
        legacyCreatedAt: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-07-01T00:00:00Z'),
        deleted: true,
        deletedAt,
      };

      const user = UserMapper.toDomain(entity);

      expect(user.deleted).toBe(true);
      expect(user.deletedAt).toEqual(deletedAt);
    });
  });

  describe('toEntity', () => {
    it('should convert User domain model to partial entity', () => {
      const user = new User({
        id: 1,
        legacyId: 12345,
        userName: 'john_doe',
        email: 'john@example.com',
        legacyCreatedAt: new Date('2024-01-15T10:00:00Z'),
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-06-15T14:30:00Z'),
        deleted: false,
        deletedAt: null,
      });

      const entity = UserMapper.toEntity(user);

      expect(entity.legacyId).toBe(12345);
      expect(entity.userName).toBe('john_doe');
      expect(entity.email).toBe('john@example.com');
      expect(entity.legacyCreatedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(entity.deleted).toBe(false);
      expect(entity.deletedAt).toBeNull();
    });

    it('should not include id, createdAt, updatedAt in partial entity', () => {
      const user = new User({
        id: 1,
        legacyId: 12345,
        userName: 'john_doe',
        email: 'john@example.com',
        legacyCreatedAt: new Date('2024-01-15T10:00:00Z'),
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-06-15T14:30:00Z'),
        deleted: false,
        deletedAt: null,
      });

      const entity = UserMapper.toEntity(user);

      expect(entity).not.toHaveProperty('id');
      expect(entity).not.toHaveProperty('createdAt');
      expect(entity).not.toHaveProperty('updatedAt');
    });

    it('should handle deleted user conversion', () => {
      const deletedAt = new Date('2024-07-01T00:00:00Z');
      const user = new User({
        id: 3,
        legacyId: 99999,
        userName: 'deleted_user',
        email: 'deleted@example.com',
        legacyCreatedAt: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2024-06-01T12:00:00Z'),
        updatedAt: new Date('2024-07-01T00:00:00Z'),
        deleted: true,
        deletedAt,
      });

      const entity = UserMapper.toEntity(user);

      expect(entity.deleted).toBe(true);
      expect(entity.deletedAt).toEqual(deletedAt);
    });
  });

  describe('fromLegacy', () => {
    it('should convert LegacyUser to UpsertUserData', () => {
      const legacyUser: LegacyUser = {
        id: 12345,
        userName: 'legacy_user',
        email: 'legacy@example.com',
        createdAt: '2024-01-15T10:00:00Z',
        deleted: false,
      };

      const upsertData = UserMapper.fromLegacy(legacyUser);

      expect(upsertData.legacyId).toBe(12345);
      expect(upsertData.userName).toBe('legacy_user');
      expect(upsertData.email).toBe('legacy@example.com');
      expect(upsertData.legacyCreatedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(upsertData.deleted).toBe(false);
    });

    it('should handle deleted legacy user', () => {
      const legacyUser: LegacyUser = {
        id: 99999,
        userName: 'deleted_legacy',
        email: 'deleted@legacy.com',
        createdAt: '2024-01-01T00:00:00Z',
        deleted: true,
      };

      const upsertData = UserMapper.fromLegacy(legacyUser);

      expect(upsertData.deleted).toBe(true);
    });

    it('should parse createdAt string to Date', () => {
      const legacyUser: LegacyUser = {
        id: 1,
        userName: 'test',
        email: 'test@test.com',
        createdAt: '2024-06-15T14:30:00.000Z',
        deleted: false,
      };

      const upsertData = UserMapper.fromLegacy(legacyUser);

      expect(upsertData.legacyCreatedAt).toBeInstanceOf(Date);
      expect(upsertData.legacyCreatedAt.toISOString()).toBe('2024-06-15T14:30:00.000Z');
    });
  });

  describe('fromLegacyBatch', () => {
    it('should convert array of LegacyUsers to array of UpsertUserData', () => {
      const legacyUsers: LegacyUser[] = [
        {
          id: 1,
          userName: 'user1',
          email: 'user1@example.com',
          createdAt: '2024-01-01T00:00:00Z',
          deleted: false,
        },
        {
          id: 2,
          userName: 'user2',
          email: 'user2@example.com',
          createdAt: '2024-02-01T00:00:00Z',
          deleted: true,
        },
        {
          id: 3,
          userName: 'user3',
          email: 'user3@example.com',
          createdAt: '2024-03-01T00:00:00Z',
          deleted: false,
        },
      ];

      const result = UserMapper.fromLegacyBatch(legacyUsers);

      expect(result).toHaveLength(3);
      expect(result[0].legacyId).toBe(1);
      expect(result[0].userName).toBe('user1');
      expect(result[1].legacyId).toBe(2);
      expect(result[1].deleted).toBe(true);
      expect(result[2].legacyId).toBe(3);
    });

    it('should return empty array for empty input', () => {
      const result = UserMapper.fromLegacyBatch([]);

      expect(result).toEqual([]);
    });

    it('should apply fromLegacy transformation to each item', () => {
      const legacyUsers: LegacyUser[] = [
        {
          id: 100,
          userName: 'batch_user',
          email: 'batch@example.com',
          createdAt: '2024-06-01T12:00:00Z',
          deleted: false,
        },
      ];

      const result = UserMapper.fromLegacyBatch(legacyUsers);

      expect(result[0]).toEqual({
        legacyId: 100,
        userName: 'batch_user',
        email: 'batch@example.com',
        legacyCreatedAt: new Date('2024-06-01T12:00:00Z'),
        deleted: false,
      });
    });
  });
});
