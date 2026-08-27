import 'dotenv/config'
import pg from 'pg'

// Dev-only seed script: refuse to run against a production environment.
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run add-oauth-test.ts in production (NODE_ENV=production).')
  process.exit(1)
}

// Secrets and connection come from env, not hard-coded literals.
// Set these in connector-server/.env (or shell) before running.
const DATABASE_URL = process.env.CONNECTOR_TEST_DATABASE_URL ?? process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Set CONNECTOR_TEST_DATABASE_URL (or DATABASE_URL) before running.')
  process.exit(1)
}
const CLIENT_ID = process.env.CONNECTOR_TEST_CLIENT_ID ?? 'f8-oauth-client'
const CLIENT_SECRET = process.env.CONNECTOR_TEST_CLIENT_SECRET ?? 'local-dev-only-secret'

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
})

async function addOAuthConnector() {
  const client = await pool.connect()

  const authConfig = JSON.stringify({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ['connector:read', 'connector:write'],
  })

  try {
    // 添加 OAuth 2.0 测试连接器
    await client.query(
      `
      INSERT INTO connector_config (
        connector_code, connector_name, direction, protocol, data_domain,
        auth_type, auth_config, endpoint_config, is_enabled, created_by, updated_by
      ) VALUES (
        'f8-oauth-test',
        'F8 OAuth 测试连接器',
        'inbound',
        'push_inbound',
        'flight',
        'oauth2_cc',
        $1,
        '{"url": "", "timeout": 30000}',
        1, 'system', 'system'
      )
      ON CONFLICT (connector_code) DO UPDATE SET
        auth_config = $1,
        is_enabled = 1
    `,
      [authConfig],
    )

    console.log('OAuth test connector created')

    // 查询所有测试连接器
    const result = await client.query(`
      SELECT connector_code, connector_name, auth_type
      FROM connector_config
      WHERE connector_code LIKE 'f8-%test'
    `)

    console.log('\nAll test connectors:')
    console.table(result.rows)

  } finally {
    client.release()
  }

  await pool.end()
}

addOAuthConnector().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
