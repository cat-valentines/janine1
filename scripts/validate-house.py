import re, sys

src = open('/Users/janine_askar/Documents/nfactorial/janine1/src/game/mansion.ts').read()
rows = re.findall(r"'([^']*)'", re.search(r'export const LAYOUT = \[(.*?)\];', src, re.S).group(1))
COLS, ROWS = len(rows[0]), len(rows)

def wall(cell):
    c, r = cell
    return c < 0 or r < 0 or c >= COLS or r >= ROWS or rows[r][c] == '#'

def find(mark):
    return [(c, r) for r in range(ROWS) for c in range(COLS) if rows[r][c] == mark]

def flood(start, blocked=frozenset()):
    """Every square reachable from start, never entering `blocked`."""
    seen = {start}
    queue = [start]
    while queue:
        c, r = queue.pop(0)
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c + dc, r + dr)
            if wall(n) or n in blocked or n in seen:
                continue
            seen.add(n)
            queue.append(n)
    return seen

start, door = find('P')[0], find('D')[0]
inside_door = (door[0], door[1] - 1)
traps = set(find('T'))
marks = {m: find(m) for m in 'KHBCTS'}
print('  keys %d | wardrobes %d | beds %d | creaks %d | traps %d | stones %d'
      % tuple(len(marks[m]) for m in 'KHBCTS'))

problems = 0
if [r for r in rows if len(r) != COLS]:
    print('  !! ragged rows'); problems += 1

reachable = flood(start)
for m, name in zip('KHBCTS', ('key', 'wardrobe', 'bed', 'creaky board', 'trap', 'stone')):
    for spot in marks[m]:
        if spot not in reachable:
            print('  !! %s at %s is walled off' % (name, spot)); problems += 1
if inside_door not in reachable:
    print('  !! the door cannot be reached — UNWINNABLE'); problems += 1

# A trap you cannot walk around is not a trap, it is a toll. There must be a
# route to every key and to the door that steps in none of them.
avoiding = flood(start, blocked=traps)
blocked_keys = [k for k in marks['K'] if k not in avoiding]
for k in blocked_keys:
    print('  !! the key at %s can ONLY be reached by standing in a trap' % (k,)); problems += 1
if inside_door not in avoiding:
    print('  !! the door can ONLY be reached by standing in a trap'); problems += 1

print('  reachable floor squares: %d   (avoiding every trap: %d)' % (len(reachable), len(avoiding)))
print('  ' + ('%d PROBLEMS' % problems if problems
              else 'solvable, and every key and the door can be reached without stepping in a trap'))
sys.exit(1 if problems else 0)
