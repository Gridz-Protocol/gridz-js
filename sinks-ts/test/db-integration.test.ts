import { describe, it, expect } from "vitest";
import { sinkRoundTripTest, postgresSink, mysqlSink, redisSink, mongoSink, neo4jSink, s3Sink } from "../src/index.js";

/**
 * Live database round-trips. SKIPPED (not mocked) unless the matching env var is
 * set — run the docker stack (docker/docker-compose.yml) and export the DSNs.
 * The shared projection logic is already covered offline by the SQLite tests.
 */
const cases: { name: string; env: string; make: () => ReturnType<typeof postgresSink> }[] = [
  { name: "postgres", env: "GRIDZ_PG_DSN", make: () => postgresSink(process.env.GRIDZ_PG_DSN!) },
  { name: "mysql", env: "GRIDZ_MYSQL_DSN", make: () => mysqlSink(process.env.GRIDZ_MYSQL_DSN!) },
  { name: "redis", env: "GRIDZ_REDIS_URL", make: () => redisSink(process.env.GRIDZ_REDIS_URL!) },
  { name: "mongo", env: "GRIDZ_MONGO_URI", make: () => mongoSink(process.env.GRIDZ_MONGO_URI!) },
  {
    name: "neo4j",
    env: "GRIDZ_NEO4J_URL",
    make: () => neo4jSink(process.env.GRIDZ_NEO4J_URL!, process.env.GRIDZ_NEO4J_USER ?? "neo4j", process.env.GRIDZ_NEO4J_PASS ?? "password"),
  },
  { name: "s3", env: "GRIDZ_S3_BUCKET", make: () => s3Sink(process.env.GRIDZ_S3_BUCKET!) },
];

for (const c of cases) {
  describe.skipIf(!process.env[c.env])(`${c.name} sink (live)`, () => {
    it("round-trips the probe grid", async () => {
      const report = await sinkRoundTripTest(c.make());
      expect(report.ok).toBe(true);
    });
  });
}
