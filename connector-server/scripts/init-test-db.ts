import 'dotenv/config'
import pg from 'pg'

// Dev-only seed script: refuse to run against a production environment.
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run init-test-db.ts in production (NODE_ENV=production).')
  process.exit(1)
}

// Secrets and connection come from env, not hard-coded literals.
const DATABASE_URL = process.env.CONNECTOR_TEST_DATABASE_URL ?? process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Set CONNECTOR_TEST_DATABASE_URL (or DATABASE_URL) before running.')
  process.exit(1)
}
const TEST_API_KEY = process.env.CONNECTOR_TEST_API_KEY ?? 'f8-test-api-key'
const TEST_API_SECRET = process.env.CONNECTOR_TEST_API_SECRET ?? 'local-dev-only-secret'

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
})

async function runMigrations() {
  const client = await pool.connect()

  try {
    console.log('Connected to database, schema: f8')

    // 检查表是否存在
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'f8' AND table_name = 'connector_config'
      )
    `)

    if (!tableCheck.rows[0].exists) {
      console.log('Creating connector_config and connector_log tables...')

      // 创建 connector_config 表
      await client.query(`
        CREATE TABLE connector_config (
          id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          connector_code    varchar(50)  NOT NULL UNIQUE,
          connector_name    varchar(100) NOT NULL,
          direction         varchar(20)  NOT NULL,
          protocol          varchar(20)  NOT NULL,
          data_domain       varchar(20)  NOT NULL,
          auth_type         varchar(20)  NOT NULL,
          auth_config       jsonb        NOT NULL,
          endpoint_config   jsonb        NOT NULL,
          schedule_cron     varchar(50),
          transform_plugin  varchar(100),
          is_enabled        smallint     NOT NULL DEFAULT 1,
          is_deleted        smallint     NOT NULL DEFAULT 0,
          created_by        varchar(50)  NOT NULL,
          created_at        timestamptz  NOT NULL DEFAULT now(),
          updated_by        varchar(50)  NOT NULL,
          updated_at        timestamptz  NOT NULL DEFAULT now()
        )
      `)

      // 创建 connector_log 表
      await client.query(`
        CREATE TABLE connector_log (
          id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          connector_id     bigint       NOT NULL REFERENCES connector_config(id),
          direction        varchar(20)  NOT NULL,
          status           varchar(20)  NOT NULL,
          records_in       int          NOT NULL DEFAULT 0,
          records_out      int          NOT NULL DEFAULT 0,
          error_message    text,
          duration_ms      int,
          executed_at      timestamptz  NOT NULL DEFAULT now()
        )
      `)

      // 创建索引
      await client.query(`
        CREATE INDEX idx_connector_log_executed_at ON connector_log(executed_at)
      `)

      console.log('Tables created successfully')
    } else {
      console.log('Tables already exist')
    }

    // 插入测试连接器配置
    console.log('Inserting test connector configs...')

    const testConfigs = [
      {
        connector_code: 'f8-flight-test',
        connector_name: 'F8 航班推送测试',
        direction: 'inbound',
        protocol: 'push_inbound',
        data_domain: 'flight',
        auth_type: 'api_key',
        auth_config: { apiKey: TEST_API_KEY, apiSecret: TEST_API_SECRET },
        endpoint_config: { url: '', timeout: 30000 },
      },
      {
        connector_code: 'f8-crew-test',
        connector_name: 'F8 机组推送测试',
        direction: 'inbound',
        protocol: 'push_inbound',
        data_domain: 'crew',
        auth_type: 'api_key',
        auth_config: { apiKey: TEST_API_KEY, apiSecret: TEST_API_SECRET },
        endpoint_config: { url: '', timeout: 30000 },
      },
      {
        connector_code: 'f8-roster-query-test',
        connector_name: 'F8 排班查询测试',
        direction: 'outbound',
        protocol: 'query_outbound',
        data_domain: 'roster',
        auth_type: 'api_key',
        auth_config: { apiKey: TEST_API_KEY, apiSecret: TEST_API_SECRET },
        endpoint_config: { url: '', timeout: 30000 },
      },
    ]

    for (const config of testConfigs) {
      await client.query(`
        INSERT INTO connector_config (
          connector_code, connector_name, direction, protocol, data_domain,
          auth_type, auth_config, endpoint_config, is_enabled, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'system', 'system')
        ON CONFLICT (connector_code) DO UPDATE SET
          auth_config = $7,
          is_enabled = 1
      `, [
        config.connector_code,
        config.connector_name,
        config.direction,
        config.protocol,
        config.data_domain,
        config.auth_type,
        JSON.stringify(config.auth_config),
        JSON.stringify(config.endpoint_config),
      ])
      console.log(`Inserted: ${config.connector_code}`)
    }

    // 查询结果
    const result = await client.query(`
      SELECT connector_code, connector_name, direction, protocol, data_domain, is_enabled
      FROM connector_config
      WHERE connector_code LIKE 'f8-%test'
    `)

    console.log('\nTest connectors:')
    console.table(result.rows)

  } finally {
    client.release()
  }

  await pool.end()
}

runMigrations().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})