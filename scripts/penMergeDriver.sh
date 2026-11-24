#!/bin/sh
# git's merge driver for `*.pen`, registered per worktree by setup.sh as
# `sh scripts/penMergeDriver.sh %O %A %B %P`. git runs it from the worktree's root, so each checkout
# runs its own copy, and changing what it does needs no config change.
#
# It runs `bun pen merge`, which merges node by node and writes its own conflict report. When that
# fails without a report (it could not start, crashed or met an unreadable input), git would leave
# ours in place with no conflict markers and nothing to say why. This script writes the report
# instead, to the same place, with the failure's output and how to merge by hand.

base=$1
ours=$2
theirs=$3
file=$4

report="$(git rev-parse --git-path pen-conflicts)/$(printf '%s' "$file" | sed 's|/|__|g').md"
output=$(mktemp)
rm -f "$report"

bun pen merge "$base" "$ours" "$theirs" "$file" 2>"$output"
code=$?
cat "$output" >&2

if [ "$code" -ne 0 ] && [ ! -f "$report" ]; then
    mkdir -p "$(dirname "$report")"
    cat >"$report" <<EOF
# Pen merge driver failed on \`$file\`

git could not merge \`$file\` node by node: \`bun pen merge\` exited with code $code. git marked the
file as conflicted and left it at **ours**: theirs' changes are not in it.

Output of \`bun pen merge\`:

\`\`\`text
$(cat "$output")
\`\`\`

Fix the cause, then merge by hand from the repo root:

\`\`\`sh
mkdir -p .context/merge
git show :1:$file > .context/merge/base.pen
git show :3:$file > .context/merge/theirs.pen
git show :2:$file > $file
bun pen merge .context/merge/base.pen $file .context/merge/theirs.pen $file
git add $file
\`\`\`
EOF
    echo "pen merge driver FAILED on $file (exit $code): ours kept, theirs not merged; report: $report" >&2
    # Above 128 git takes the driver for crashed and stops the merge; a conflict is what a person can resolve.
    code=1
fi

rm -f "$output"
exit "$code"
