$env:DATABASE_URL = 'postgresql://postgres:Pier2026AI123@47.237.67.15:55432/recovery?options=-c%20search_path%3Ddev_live'
Set-Location 'D:\recovery\live-server'
node -e 'import("pg").then(async ({default: pg}) => { const c = new pg.Client({connectionString: process.env.DATABASE_URL}); await c.connect(); const r = await c.query(select id, name, category, type, division, enabled from workset where category = ''RULE'' order by 1); console.log(JSON.stringify(r.rows, null, 2)); await c.end(); })'
