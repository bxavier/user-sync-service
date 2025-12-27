/** Properties for User domain model. */
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
 * Pure domain model for User (no ORM dependencies).
 * Key: userName (unique), legacyId (sync tracking), deleted (soft delete).
 */
export class User {
  /** @param props - User properties (immutable after construction) */
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

  /**
   * Converts to plain object for serialization.
   * @returns Shallow copy of user properties
   */
  toPlainObject(): UserProps {
    return { ...this.props };
  }
}
