require('dotenv').config({ quiet: true })
const pg = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const Fastify = require('fastify')
const pairingRoutes = require('../dist/routes/pairing/pairing.js').default
const { roundtripService } = require('../dist/services/pairing/roundtrip-service.js')

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 5000 })
  const app = Fastify()
  app.decorate('db', drizzle(pool))
  try {
    await app.register(pairingRoutes)
    const options = await roundtripService.options(app)
    if (!options.bases.includes('ADD')) throw new Error('ADD reference base is missing')
    const receipts = []
    for (const fleet of options.fleets) {
      const scope = { startDate: '2026-09-20', endDate: '2026-09-30', ganttStart: '2026-09-01', ganttEnd: '2026-09-30', timezone: 'UTC', base: 'ADD', fleet, composition: options.composition.wide, rules: options.defaults }
      const response = await app.inject({ method: 'POST', url: '/roundtrip/search', payload: { scope } })
      if (response.statusCode !== 200) throw new Error(response.json().message)
      const { flights, rotations } = response.json().data
      receipts.push({ fleet, flights: flights.length, rotations: rotations.length, layovers: rotations.filter(r => r.dutyFlightIds.length > 1).length, fourLeg: rotations.filter(r => r.dutyFlightIds.length === 1 && r.flightIds.length === 4).length })
    }
    console.log(JSON.stringify({ status: 'PASS', readOnly: true, receipts }, null, 2))
  } finally { await app.close(); await pool.end() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
