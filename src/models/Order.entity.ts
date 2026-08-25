import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { TrackingHistoryEntity } from "./TrackingHistory.entity";
import { ShipmentStatus } from "../core/enums";

@Entity("orders")
export class OrderEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ name: "internal_order_id", type: "varchar", length: 255 })
  internalOrderId!: string;

  @Index()
  @Column({ name: "courier_partner", type: "varchar", length: 100 })
  courierPartner!: string;

  @Column({ name: "courier_shipment_id", type: "varchar", nullable: true })
  courierShipmentId!: string | null;

  @Column({ name: "awb_number", type: "varchar", nullable: true })
  awbNumber!: string | null;

  @Index()
  @Column({
    name: "status",
    type: "varchar",
    length: 30,
    default: ShipmentStatus.CREATED,
  })
  status!: ShipmentStatus;

  // Sender details
  @Column({ name: "sender_name", type: "varchar" })
  senderName!: string;

  @Column({ name: "sender_phone", type: "varchar" })
  senderPhone!: string;

  @Column({ name: "sender_address", type: "text" })
  senderAddress!: string;

  @Column({ name: "sender_city", type: "varchar" })
  senderCity!: string;

  @Column({ name: "sender_state", type: "varchar" })
  senderState!: string;

  @Column({ name: "sender_pincode", type: "varchar", length: 10 })
  senderPincode!: string;

  // Recipient details
  @Column({ name: "recipient_name", type: "varchar" })
  recipientName!: string;

  @Column({ name: "recipient_phone", type: "varchar" })
  recipientPhone!: string;

  @Column({ name: "recipient_address", type: "text" })
  recipientAddress!: string;

  @Column({ name: "recipient_city", type: "varchar" })
  recipientCity!: string;

  @Column({ name: "recipient_state", type: "varchar" })
  recipientState!: string;

  @Column({ name: "recipient_pincode", type: "varchar", length: 10 })
  recipientPincode!: string;

  // Package details
  @Column({ name: "weight_kg", type: "decimal", precision: 8, scale: 3 })
  weightKg!: number;

  @Column({
    name: "payment_mode",
    type: "varchar",
    length: 20,
    default: "prepaid",
  })
  paymentMode!: string;

  // Audit: full payloads stored for debugging and reconciliation
  @Column({ name: "raw_request_payload", type: "simple-json", nullable: true })
  rawRequestPayload!: Record<string, unknown> | null;

  @Column({ name: "raw_response_payload", type: "simple-json", nullable: true })
  rawResponsePayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => TrackingHistoryEntity, (th) => th.order)
  trackingHistory!: TrackingHistoryEntity[];
}
