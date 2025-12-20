import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'legacy_id', type: 'integer', nullable: true })
  legacyId: number | null;

  @Column({ name: 'user_name', type: 'varchar', length: 50, unique: true })
  userName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'legacy_created_at', type: 'datetime', nullable: true })
  legacyCreatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}
