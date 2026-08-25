import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import path from "path";
import { env } from "./env";
import { OrderEntity } from "../models/Order.entity";
import { TrackingHistoryEntity } from "../models/TrackingHistory.entity";

/**
 * TypeORM DataSource used both at runtime and during CLI migrations.
 *
 * DB_TYPE=sqlite  → uses a local SQLite file (dev.sqlite) for quick local
 *                   development with zero external dependencies.
 * DB_TYPE=postgres → connects to a real PostgreSQL instance (production/staging).
 */
const baseOptions: Partial<DataSourceOptions> = {
  synchronize: env.nodeEnv === "development",
  logging: env.nodeEnv === "development",
  entities: [OrderEntity, TrackingHistoryEntity],
  migrations: ["src/migrations/*.ts"],
};

const sqliteOptions: DataSourceOptions = {
  ...baseOptions,
  type: "better-sqlite3",
  database: path.join(process.cwd(), "dev.sqlite"),
} as DataSourceOptions;

const postgresOptions: DataSourceOptions = {
  ...baseOptions,
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
} as DataSourceOptions;

export const AppDataSource = new DataSource(
  env.db.type === "postgres" ? postgresOptions : sqliteOptions,
);
