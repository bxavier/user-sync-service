import { User, UserProps } from './user.model';

describe('User', () => {
  const validProps: UserProps = {
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

  describe('constructor', () => {
    it('should create a User instance with valid props', () => {
      const user = new User(validProps);

      expect(user).toBeInstanceOf(User);
    });

    it('should create a User with nullable fields as null', () => {
      const propsWithNulls: UserProps = {
        ...validProps,
        id: undefined,
        legacyId: null,
        legacyCreatedAt: null,
        deletedAt: null,
      };

      const user = new User(propsWithNulls);

      expect(user.id).toBeUndefined();
      expect(user.legacyId).toBeNull();
      expect(user.legacyCreatedAt).toBeNull();
      expect(user.deletedAt).toBeNull();
    });
  });

  describe('getters', () => {
    let user: User;

    beforeEach(() => {
      user = new User(validProps);
    });

    it('should return correct id', () => {
      expect(user.id).toBe(1);
    });

    it('should return correct legacyId', () => {
      expect(user.legacyId).toBe(12345);
    });

    it('should return correct userName', () => {
      expect(user.userName).toBe('john_doe');
    });

    it('should return correct email', () => {
      expect(user.email).toBe('john@example.com');
    });

    it('should return correct legacyCreatedAt', () => {
      expect(user.legacyCreatedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('should return correct createdAt', () => {
      expect(user.createdAt).toEqual(new Date('2024-06-01T12:00:00Z'));
    });

    it('should return correct updatedAt', () => {
      expect(user.updatedAt).toEqual(new Date('2024-06-15T14:30:00Z'));
    });

    it('should return correct deleted status', () => {
      expect(user.deleted).toBe(false);
    });

    it('should return correct deletedAt', () => {
      expect(user.deletedAt).toBeNull();
    });
  });

  describe('toPlainObject', () => {
    it('should return a plain object with all properties', () => {
      const user = new User(validProps);

      const plainObject = user.toPlainObject();

      expect(plainObject).toEqual(validProps);
    });

    it('should return a new object (not reference)', () => {
      const user = new User(validProps);

      const plainObject = user.toPlainObject();

      expect(plainObject).not.toBe(validProps);
      expect(plainObject).toEqual(validProps);
    });

    it('should include all fields even when null/undefined', () => {
      const propsWithNulls: UserProps = {
        id: undefined,
        legacyId: null,
        userName: 'test',
        email: 'test@test.com',
        legacyCreatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deleted: false,
        deletedAt: null,
      };
      const user = new User(propsWithNulls);

      const plainObject = user.toPlainObject();

      expect(plainObject).toHaveProperty('id');
      expect(plainObject).toHaveProperty('legacyId');
      expect(plainObject).toHaveProperty('legacyCreatedAt');
      expect(plainObject).toHaveProperty('deletedAt');
    });
  });

  describe('deleted user', () => {
    it('should correctly represent a soft-deleted user', () => {
      const deletedAt = new Date('2024-07-01T00:00:00Z');
      const deletedProps: UserProps = {
        ...validProps,
        deleted: true,
        deletedAt,
      };

      const user = new User(deletedProps);

      expect(user.deleted).toBe(true);
      expect(user.deletedAt).toEqual(deletedAt);
    });
  });
});
