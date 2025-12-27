export class User {
  id: number;
  userName: string;
  email: string;
  createdAt: Date;
  deleted: boolean;

  constructor(id: number, userName: string, email: string, createdAt: Date, deleted: boolean) {
    this.id = id;
    this.userName = userName;
    this.email = email;
    this.createdAt = createdAt;
    this.deleted = deleted;
  }
}