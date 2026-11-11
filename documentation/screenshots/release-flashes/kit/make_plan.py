"""usage: make_plan.py <select.json> <plan.json>
The render's rows: at 159, 140 and 120 a minute, two real peaks each from select.mjs (the one whose swing is widest while the beams open,
and the one whose swing changes most around the release), each with the figures' phase at the peak on each of the loop's eight beats.
159 takes the loudness of a peak at 158, the fastest tempo any peak reads."""
import json, sys
sel = json.load(open(sys.argv[1]))
rows = []
for label, bpm in (("159", 159), ("140", 140), ("120", 120)):
    for kind, p in (("wide", sel[label]["picked"]), ("change", sel[label]["widestChange"])):
        for phase in range(8):
            rows.append({"name": f"{bpm}-{kind}-p{phase}", "bpm": bpm, "kind": kind, "phase": phase, "show": p["show"], "index": p["index"],
                         "title": p["title"], "peak": p["second"], "mapTempo": p["tempo"]})
json.dump({"rows": rows}, open(sys.argv[2], "w"), indent=1)
print(len(rows), "rows;", ", ".join(sorted({f"{r['bpm']} {r['kind']}: {r['show']} #{r['index']} {r['title']} at {r['peak']} s" for r in rows})))
