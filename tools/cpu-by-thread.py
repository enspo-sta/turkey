#!/usr/bin/env python3
# Processor time used by each thread of the browser during one frame-time
# tour (tools/perf-tour.mjs, from the line "loaded and warmed up" to the
# end), read from /proc every half second and summed by the kind of process
# and the thread's name (numbers at the end of a name dropped): the page's
# main thread, the software renderer's workers, the display compositor, the
# sound threads. A build whose frames take longer but whose threads do no
# more work is waiting, not working. Linux only (it reads /proc).
# Usage: python3 tools/cpu-by-thread.py dist/index.html out.json [--size 844x390 --dpr 2]
import subprocess, sys, time, os, json, re, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

build, out = sys.argv[1], sys.argv[2]
extra = sys.argv[3:]
HZ = os.sysconf('SC_CLK_TCK')


def kind_of(pid):
    cmd = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
    if not cmd or b'headless_shell' not in cmd[0]:
        return None
    # (a child process rewrites its command line as one string with spaces)
    whole = b' '.join(cmd)
    m = re.search(rb'--type=([\w-]+)', whole)
    kind = m.group(1).decode() if m else 'browser'
    u = re.search(rb'--utility-sub-type=([\w.]+)', whole)
    if u:
        kind = 'utility:' + u.group(1).decode().split('.')[-1]
    return kind


def threads():
    res = {}
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            kind = kind_of(pid)
            if not kind:
                continue
            for tid in os.listdir(f'/proc/{pid}/task'):
                try:
                    name = open(f'/proc/{pid}/task/{tid}/comm').read().strip()
                    st = open(f'/proc/{pid}/task/{tid}/stat').read()
                    f = st[st.rfind(')') + 2:].split()
                    cpu = (int(f[11]) + int(f[12])) / HZ
                    res[(int(pid), int(tid))] = (kind, re.sub(r'[\d<>]+$', '', name) or name, cpu)
                except (FileNotFoundError, ProcessLookupError, IndexError):
                    pass
        except (FileNotFoundError, ProcessLookupError, PermissionError, IndexError):
            pass
    return res


p = subprocess.Popen(['node', 'tools/perf-tour.mjs', os.path.abspath(out) + '.tour.json', '--noprofile', '--frames', '90', '--file', os.path.abspath(build)] + extra,
                     cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
last, marks, lines = {}, {}, []


def reader():
    for line in p.stdout:
        lines.append(line.rstrip())
        if 'loaded and warmed up' in line:
            marks['start'] = threads()
            marks['t0'] = time.time()


th = threading.Thread(target=reader, daemon=True)
th.start()
while p.poll() is None:
    for k, v in threads().items():
        last[k] = v
    time.sleep(0.5)
th.join(timeout=5)
t1 = time.time()
s0 = marks.get('start', {})
by = {}
for k, (kind, name, cpu) in last.items():
    c0 = s0[k][2] if k in s0 else 0.0
    key = f'{kind} / {name}'
    by[key] = by.get(key, 0.0) + (cpu - c0)
res = {'build': build, 'tour_wall_s': round(t1 - marks.get('t0', t1), 1),
       'cpu_s_by_thread': {k: round(v, 2) for k, v in sorted(by.items(), key=lambda kv: -kv[1]) if v >= 0.005},
       'segments': [l for l in lines if ': total mean' in l], 'log_tail': lines[-12:]}
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps(res, indent=1))
