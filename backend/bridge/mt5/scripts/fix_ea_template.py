import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the new ExecuteCommands function and remove duplicate old code after it
new_exec_start = None
new_exec_end = None
for i, line in enumerate(lines):
    if 'void ExecuteCommands(string json)' in line and new_exec_start is None:
        new_exec_start = i
    if new_exec_start is not None and line.strip() == '}}' and i > new_exec_start + 5:
        new_exec_end = i
        break

if new_exec_start is not None and new_exec_end is not None:
    # Find the next function after ExecuteCommands
    next_function = None
    for i in range(new_exec_end + 1, len(lines)):
        if lines[i].startswith('//+------------------------------------------------------------------+'):
            next_function = i
            break
    
    if next_function:
        # Keep everything up to and including the new ExecuteCommands, then skip duplicates
        cleaned = lines[:new_exec_end + 1]
        cleaned.extend(lines[next_function:])
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(cleaned)
        print(f'Removed duplicate code between lines {new_exec_end + 1} and {next_function}')
    else:
        print('No next function found')
else:
    print('ExecuteCommands function not found')
