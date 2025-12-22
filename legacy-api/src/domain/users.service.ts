import { User } from './user';
import { Repository } from '../infrastructure/repository';

export class UsersService {
  async getPaginatedUsers(skip: number, limit: number): Promise<{ total: number, data: User[] }> {
    const repository = new Repository();
    const total = await repository.count();
    const data = await repository.findAll(skip, limit);
    return { total, data };
  }
}