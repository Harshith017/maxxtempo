# Split app.js (one IIFE) into feature files that share the page's global scope.
import re, sys, os
src = sys.argv[1]; out = sys.argv[2]
lines = open(src).read().split('\n')
assert lines[3] == "(() => {" and lines[4] == "'use strict';", lines[3:5]
# drop the closing of the outer IIFE (last non-empty line)
while lines[-1] == '': lines.pop()
assert lines[-1] == '})();' and lines[-2] == '})();', lines[-3:]
lines = lines[:-1]
def at(marker):
    idx = [i for i, l in enumerate(lines) if l.startswith('/* ---------- ' + marker)]
    assert len(idx) == 1, (marker, idx); return idx[0]
FILES = [
  ('app-core.js',    'constants',               'Constants, helpers, state, storage and the numbers everything else is built on (targets, totals, burn).'),
  ('app-log.js',     'AI logging',              'Logging: reading typed entries (built-in tables first, then AI), foods, INDB, sports and their profiles, the activity panel.'),
  ('app-health.js',  'health reports',          'Blood-test reports, the weekly review, food suggestions, exercise standards, the rest timer, small UI bits and charts.'),
  ('app-today.js',   'views',                   'Shared view pieces and the Today page.'),
  ('app-train.js',   'Train',                   'The Train page: live workouts, routines, gym progress and the exercise library.'),
  ('app-food.js',    'food search',             'Food search and portions, restaurant meals (California Burrito, WeFit), barcodes and pack labels.'),
  ('app-trends.js',  'Trends',                  'The Trends page: the last 7 days, training trends, body measurements and photos.'),
  ('app-profile.js', 'Profile',                 'Profile and settings, daily supplements, export, and the edit dialogs.'),
  ('app-main.js',    'render + events',         'Rendering, events, sign-in and access, passkeys, Health sync, the leaderboard, the feed, approvals, and start-up.'),
]
starts = [at(m) for _, m, _ in FILES]
assert starts == sorted(starts), starts
header_end = starts[0]                # lines before "constants": file comment + wrapper + const Calc
pre = lines[:header_end]
# keep the file comment (lines 0-2) for app-core, drop the wrapper lines, keep the rest (e.g. const Calc)
core_pre = pre[0:3] + ["'use strict';"] + pre[5:]
os.makedirs(out, exist_ok=True)
for k, (name, marker, desc) in enumerate(FILES):
    a = starts[k]; b = starts[k+1] if k+1 < len(FILES) else len(lines)
    body = lines[a:b]
    if k == 0: text = core_pre + body
    else: text = [f"/* MaxxTempo — {desc}\n   Part of the app split across app-*.js; they share the page's scope and load in order (index.html). */", "'use strict';", ""] + body
    open(os.path.join(out, name), 'w').write('\n'.join(text).rstrip('\n') + '\n')
    print(name, b - a, 'lines')
