import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { OrderEntity } from "./Order.entity";
import { ShipmentStatus } from "../core/enums";

/**
 * Append-only tracking event table.
 * Every status update from the courier is recorded as a new row
 * regardless of whether the status has changed. This provides a
 * full audit trail and supports event-sourcing queries later.
 */
@Entity("tracking_history")
export class TrackingHistoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "order_id", type: "varchar" })
  orderId!: string;

  @Column({
    name: "status",
    type: "varchar",
    length: 30,
  })
  status!: ShipmentStatus;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "location", type: "varchar", nullable: true })
  location!: string | null;

  @Column({ name: "raw_payload", type: "simple-json", nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @ManyToOne(() => OrderEntity, (order) => order.trackingHistory, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "order_id" })
  order!: OrderEntity;
}
