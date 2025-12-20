import { User } from '../entities';

export interface FindAllOptions {
  page?: number;
  limit?: number;
  includeDeleted?: boolean;
}

export interface FindAllResult {
  users: User[];
  total: number;
}

export interface CreateUserData {
  userName: string;
  email: string;
  legacyId?: number | null;
  legacyCreatedAt?: Date | null;
}

export interface UpdateUserData {
  userName?: string;
  email?: string;
}

export interface UpsertUserData {
  legacyId: number;
  userName: string;
  email: string;
  legacyCreatedAt: Date;
  deleted: boolean;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findAll(options?: FindAllOptions): Promise<FindAllResult>;
  findById(id: number): Promise<User | null>;
  findByUserName(userName: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: number, data: UpdateUserData): Promise<User | null>;
  softDelete(id: number): Promise<boolean>;
  upsertByLegacyId(data: UpsertUserData): Promise<User>;
}
