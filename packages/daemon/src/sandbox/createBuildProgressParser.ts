/** Reads BuildKit's plain progress output, line by line, into the fraction of an image build that is done. */
export interface BuildProgressParser {
    /** Feeds one output line; a line that is not about a build step changes nothing. */
    push(line: string): void;
    /** Completed steps over all steps (the export counts as the last one), 0–1; 0 until the first step is seen. */
    readonly fraction: number;
}

/** `#6 [2/4] RUN …`, or `#6 [stage-0 2/4] RUN …`; the bracket must follow the vertex id, so a step's own output never matches. */
const STEP_HEADER = /^#(\d+) \[(?:\S+ )?\d+\/(\d+)\]/;
const EXPORT_HEADER = /^#(\d+) exporting to image/;
const STEP_END = /^#(\d+) (?:DONE|CACHED)\b/;

/**
 * Creates the parser of one build's output. All steps weigh the same; `[internal]` vertices and a step's own output
 * are ignored, and a failed step (`ERROR`) is not completed.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createBuildProgressParser(): BuildProgressParser {
    const stepVertices = new Set<string>();
    const completedVertices = new Set<string>();
    let exportVertex: string | undefined;
    let declaredSteps = 0;

    return {
        push,
        get fraction() {
            return getFraction();
        },
    };

    function push(line: string) {
        const text = line.trim();

        const header = STEP_HEADER.exec(text);
        if (header) {
            stepVertices.add(header[1] ?? '');
            declaredSteps = Math.max(declaredSteps, Number(header[2]));
            return;
        }
        const exportHeader = EXPORT_HEADER.exec(text);
        if (exportHeader) {
            exportVertex = exportHeader[1];
            return;
        }
        const end = STEP_END.exec(text);
        if (end) {
            const vertex = end[1] ?? '';
            if (stepVertices.has(vertex) || vertex === exportVertex) {
                completedVertices.add(vertex);
            }
        }
    }

    function getFraction() {
        if (stepVertices.size === 0) {
            return 0;
        }
        const total = Math.max(declaredSteps, stepVertices.size) + 1;
        return Math.min(completedVertices.size / total, 1);
    }
}
