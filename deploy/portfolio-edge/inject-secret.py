#!/usr/bin/env python3
"""Read key from hidden local input or piped secret manager; never argv/env/log."""
import getpass, re, subprocess, sys
key = sys.stdin.readline().strip() if not sys.stdin.isatty() else getpass.getpass('Gateway key (hidden): ')
if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', key):
    raise SystemExit('Invalid gateway key')
subprocess.run(['docker', 'compose', '-f', str(__import__('pathlib').Path(__file__).with_name('compose.yml')), 'exec', '-T', 'gateway',
    'sh', '-c', 'umask 077; cat > /run/secrets/.portfolio.tmp && mv /run/secrets/.portfolio.tmp /run/secrets/portfolio-gateway-key'], input=key.encode(), check=True)
print('Key injected into gateway tmpfs; gateway deletes the file after loading.')
