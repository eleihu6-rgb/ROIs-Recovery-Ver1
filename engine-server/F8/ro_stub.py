"""Integration stub RO optimizer. Runs with cwd = task working dir; reads
input.gz there, pairs crew↔pairing round-robin, writes a valid output.gz (DONE).
Stands in for the not-yet-built ro-engine transform during live e2e."""
import os, sys, gzip, csv, io

def read_sections(path):
    with gzip.open(path, "rt", errors="replace") as f:
        text = f.read()
    secs, cur, lines = {}, None, []
    def flush():
        if cur is not None:
            secs[cur] = list(csv.DictReader(lines))
    for raw in text.splitlines():
        s = raw.strip()
        if s.startswith("## "):
            flush(); cur = s[3:].strip(); lines = []
        elif not s:
            continue
        else:
            lines.append(raw)
    flush()
    return secs

def main():
    # cwd is the task working dir; input.gz / output.gz live here.
    inp = "input.gz" if os.path.exists("input.gz") else os.path.basename(sys.argv[2])
    secs = read_sections(inp)
    crews = [r.get("crew_id") for r in secs.get("crew", []) if r.get("crew_id")]
    pairings = [r.get("id") for r in secs.get("pairing", []) if r.get("id")]
    print("PROGRESS:10", flush=True)
    assignments = []
    if crews and pairings:
        for i, crew in enumerate(crews[:200]):
            assignments.append((crew, pairings[i % len(pairings)]))
    print("PROGRESS:80", flush=True)
    buf = io.StringIO()
    buf.write("## RESULT_META\nstatus,assignments\nDONE,%d\n" % len(assignments))
    buf.write("## KPI\ncode,value\ncoverage,1.0\nassigned,%d\n" % len(assignments))
    buf.write("## ASSIGNMENTS\ncrew_id,pairing_id\n")
    for c, p in assignments:
        buf.write(f"{c},{p}\n")
    with gzip.open("output.gz", "wb") as f:
        f.write(buf.getvalue().encode("utf-8"))
    print("PROGRESS:100", flush=True)

if __name__ == "__main__":
    main()
