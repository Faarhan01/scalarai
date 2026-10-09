import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Check current escaping
lines = content.split('\n')
for i, line in enumerate(lines):
    if '\\"type\\"' in line:
        print(f'Line {i+1}: {line[:120]}')
