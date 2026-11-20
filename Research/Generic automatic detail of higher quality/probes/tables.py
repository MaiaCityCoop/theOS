# Turns the probe's outputs into the note's tables (so no number is copied by hand).
import re, sys, os
d = sys.argv[1]
def short(way):
    way = way.replace('the solid pieces', 'solid pieces').replace('the cut-out pieces', 'cut-out pieces')
    way = re.sub(r'a (solid )?hull of (\d+) round its largest crowd', r'a \1hull of \2 round its largest crowd', way)
    return way
rows2, rows3, tot3 = [], {}, {}
name = None
for f in ['one-stick-boulder-tent-mastic.txt', 'one-stick-oak-pine.txt']:
    for line in open(os.path.join(d, f)):
        m = re.match(r'== (.*?): (\d+) triangles', line)
        if m: name = m.group(1); continue
        m = re.match(r'\s+(.+?)\s+from\s+(\d+) px,\s+(\d+) triangles \| today: outline\s+(\d+) %, a neighbourhood off by\s+(\d+) % \(worst\s+(\d+) %\) \| (.*) \((\d+)\): outline\s+(\d+) %, a neighbourhood off by\s+(\d+) % \(worst\s+(\d+) %\)', line)
        if m: rows2.append((name,) + m.groups())
for f in ['spread-oak.txt', 'spread-pine.txt', 'spread-tent-mastic-boulder.txt']:
    for line in open(os.path.join(d, f)):
        m = re.match(r'== (.*?): (\d+) triangles', line)
        if m: name = m.group(1); rows3[name] = []; continue
        m = re.search(r'spread by size: all (\d+) down to (\d+) px', line)
        if m: tot3[name] = [m.group(2)]; continue
        m = re.match(r'\s+at\s+(\d+) px \| today \(\s*(\d+) triangles\): outline\s+(\d+) %, a neighbourhood off by\s+(\d+) % \(worst\s+(\d+) %\) \| spread \(\s*(\d+), (.*?)\): outline\s+(\d+) %, a neighbourhood off by\s+(\d+) % \(worst\s+(\d+) %\)', line)
        if m: rows3[name].append(m.groups()); continue
        m = re.search(r'over these sizes: a neighbourhood off on average (\d+) % today, (\d+) % spread; at its most (\d+) % today, (\d+) % spread; the outline off by at most (\d+) % today, (\d+) % spread', line)
        if m: tot3[name] += list(m.groups())
order = ['Boulder', 'Bell tent', 'Holm oak', 'Stone pine', 'Mastic']
print('### TABLE 2\n')
print('| Asset | Today\'s level, from | Triangles | Today: outline, a neighbourhood off, worst | The builder\'s way | Triangles | The builder: outline, off, worst |')
print('| --- | --- | --- | --- | --- | --- | --- |')
cnt = {'out': [0, 0, 0], 'mean': [0, 0, 0], 'worst': [0, 0, 0]}
for n in order:
    first = True
    for r in [r for r in rows2 if r[0] == n]:
        _, lvl, px, tt, to, tm, tw, way, st, so, sm, sw = r
        print(f"| {n if first else ''} | {lvl}, {px} px | {int(tt):,} | {to} %, {tm} %, {tw} % | {short(way)} | {int(st):,} | {so} %, {sm} %, {sw} % |"); first = False
        a, b = abs(int(to) - 100), abs(int(so) - 100); cnt['out'][0 if b < a else 1 if b == a else 2] += 1
        cnt['mean'][0 if int(sm) < int(tm) else 1 if int(sm) == int(tm) else 2] += 1
        cnt['worst'][0 if int(sw) < int(tw) else 1 if int(sw) == int(tw) else 2] += 1
print(f"\nrows: {len(rows2)}; the builder nearer / equal / further: outline {cnt['out']}, a neighbourhood on average {cnt['mean']}, at its worst {cnt['worst']}")
print('\n### TABLE 3\n')
print('| Asset | All its triangles down to | A neighbourhood off, mean over the sizes: today, spread | At its most: today, spread | Outline off at most: today, spread | Sizes where spread reads worse on average |')
print('| --- | --- | --- | --- | --- | --- |')
for n in order:
    if n not in rows3: continue
    R = [r for r in rows3[n] if not (r[1] == r[5] and r[3] == '0')]   # sizes where both draw all of it tell nothing
    worse = [f"{r[0]} px ({r[3]} to {r[8]} %)" for r in rows3[n] if int(r[8]) > int(r[3])]
    t = tot3[n]
    print(f"| {n} | {t[0]} px | {t[1]} %, {t[2]} % | {t[3]} %, {t[4]} % | {t[5]} %, {t[6]} % | {len(worse)} of {len(rows3[n])}: {', '.join(worse) if worse else 'none'} |")
print('\n### ROWS 3\n')
for n in order:
    if n not in rows3: continue
    print(f'**{n}**\n')
    print('| Size | Today: triangles | outline, off, worst | Spread: triangles | its way | outline, off, worst |')
    print('| --- | --- | --- | --- | --- | --- |')
    for px, tt, to, tm, tw, st, way, so, sm, sw in rows3[n]:
        print(f"| {px} px | {int(tt):,} | {to} %, {tm} %, {tw} % | {int(st):,} | {short(way)} | {so} %, {sm} %, {sw} % |")
    print()
