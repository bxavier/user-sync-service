export interface UserProps {
  id?: number;
  legacyId: number | null;
  userName: string;
  email: string;
  legacyCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
  deletedAt: Date | null;
}

/**
 * Modelo de domínio puro para User.
 * Não contém decoradores de ORM - representa apenas a lógica de negócio.
 */
export class User {
  constructor(private readonly props: UserProps) {}

  get id(): number | undefined {
    return this.props.id;
  }

  get legacyId(): number | null {
    return this.props.legacyId;
  }

  get userName(): string {
    return this.props.userName;
  }

  get email(): string {
    return this.props.email;
  }

  get legacyCreatedAt(): Date | null {
    return this.props.legacyCreatedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deleted(): boolean {
    return this.props.deleted;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  toPlainObject(): UserProps {
    return { ...this.props };
  }
}
