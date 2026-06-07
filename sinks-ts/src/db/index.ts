import { StoreSink } from "./store.js";
import { SqliteCellStore } from "./sqlite.js";
import {
  PostgresCellStore,
  MysqlCellStore,
  RedisCellStore,
  MongoCellStore,
  Neo4jCellStore,
  S3CellStore,
} from "./drivers.js";

export { StoreSink, encodeCell, decodeCell, type CellStore } from "./store.js";
export { SqliteCellStore } from "./sqlite.js";
export {
  PostgresCellStore,
  MysqlCellStore,
  RedisCellStore,
  MongoCellStore,
  Neo4jCellStore,
  S3CellStore,
} from "./drivers.js";
export { SnsSink } from "./sns.js";

/** Factory functions returning ready-to-use Sinks. */
export const sqliteSink = (path?: string): StoreSink => new StoreSink(new SqliteCellStore(path));
export const postgresSink = (dsn: string): StoreSink => new StoreSink(new PostgresCellStore(dsn));
export const mysqlSink = (dsn: string): StoreSink => new StoreSink(new MysqlCellStore(dsn));
export const redisSink = (url: string): StoreSink => new StoreSink(new RedisCellStore(url));
export const mongoSink = (uri: string, db?: string): StoreSink => new StoreSink(new MongoCellStore(uri, db));
export const neo4jSink = (url: string, user: string, password: string): StoreSink =>
  new StoreSink(new Neo4jCellStore(url, user, password));
export const s3Sink = (bucket: string, config?: Record<string, unknown>): StoreSink =>
  new StoreSink(new S3CellStore(bucket, config));
