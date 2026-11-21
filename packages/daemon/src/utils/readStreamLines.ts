/**
 * Reads a byte stream to the end, calling `onLine` with each line as it completes (a last line without a newline
 * included), and returns the whole text. For following a process's output while still keeping all of it.
 * @util
 */
export async function readStreamLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
    const decoder = new TextDecoder();
    let text = '';
    let pending = '';
    for await (const chunk of stream) {
        const decoded = decoder.decode(chunk, { stream: true });
        text += decoded;
        pending += decoded;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
            onLine(line);
        }
    }
    const rest = decoder.decode();
    text += rest;
    pending += rest;
    if (pending !== '') {
        onLine(pending);
    }
    return text;
}
