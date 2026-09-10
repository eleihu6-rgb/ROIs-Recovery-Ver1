const url = 'http://localhost:3000/api/violations?groupCode=1&crewIds=1076,1689,1024,1099,1141,1331,13377,13544,1369,1464,1488,1562,1972,2078,2126,2224,2380,2381,2548,609,654,815,847,857,918&start=2026-01-01T00:00:00.000Z&end=2026-12-31T00:00:00.000Z';
const res = await fetch(url);
console.log('status:', res.status);
const j = await res.json();
console.log('count:', j.data?.length);
const codes = {};
for (const g of j.data ?? []) {
  for (const c of g.checkResults ?? []) {
    codes[c.ruleCode] = (codes[c.ruleCode] ?? 0) + 1;
  }
}
console.log('codes:', codes);
