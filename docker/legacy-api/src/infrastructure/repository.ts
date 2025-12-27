import path from 'path';
import { User } from '../domain/user';
import Database from 'better-sqlite3';

export class Repository {

  async count(): Promise<number> {
    const databasePath = path.join(__dirname, 'users.db');
    const database = new Database(databasePath);
    const statement = database.prepare('SELECT COUNT(*) AS count FROM users');
    return (statement.get() as any).count;
  }

  async findAll(skip: number, limit: number): Promise<User[]> {
    const databasePath = path.join(__dirname, 'users.db');
    const database = new Database(databasePath);
    const statement = database.prepare('SELECT * FROM users LIMIT ? OFFSET ?').all(limit, skip);
    return statement.map((row: any) => 
      new User(
        row.id, 
        row.user_name, 
        row.email, 
        new Date(row.created_at),
        row.deleted ? true : false,
      )
    );
  }

}