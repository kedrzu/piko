import { expect, test } from 'bun:test';

import { createBuildProgressParser } from './createBuildProgressParser.js';

const BUILD_OUTPUT = `#1 [internal] load build definition from Containerfile
#1 transferring dockerfile: 122B done
#1 DONE 0.0s

#2 [internal] load metadata for docker.io/library/debian:trixie-slim
#2 DONE 0.9s

#3 [internal] load .dockerignore
#3 transferring context: 2B done
#3 DONE 0.0s

#4 [1/4] FROM docker.io/library/debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
#4 resolve docker.io/library/debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 done
#4 CACHED

#5 [internal] preparing inline document
#5 DONE 0.0s

#6 [2/4] RUN echo one && sleep 1
#6 0.074 one
#6 DONE 1.1s

#7 [3/4] COPY <<EOF /x
#7 DONE 0.0s

#8 [4/4] RUN echo two
#8 0.043 two
#8 DONE 0.1s

#9 exporting to image
#9 exporting layers 0.0s done
#9 exporting manifest sha256:730f… done
#9 naming to docker.io/library/pk-probe:1 done
#9 DONE 0.1s
`;

test('the fraction rises with each completed step, to 1 at the end of the export', () => {
    const parser = createBuildProgressParser();
    const lines = BUILD_OUTPUT.split('\n');
    const fractions = lines.map(line => {
        parser.push(line);
        return parser.fraction;
    });

    expect(fractions[0]).toBe(0);
    expect(fractions).toEqual(fractions.toSorted((a, b) => a - b));
    expect(fractions[lines.indexOf('#9 naming to docker.io/library/pk-probe:1 done')]).toBe(4 / 5);
    expect(parser.fraction).toBe(1);

    const checkpoints = createBuildProgressParser();
    const rest = BUILD_OUTPUT.split('\n');
    const read = (until: string) => {
        for (const line of rest.splice(0, rest.indexOf(until) + 1)) {
            checkpoints.push(line);
        }
        return checkpoints.fraction;
    };
    expect(read('#4 CACHED')).toBe(1 / 5);
    expect(read('#6 DONE 1.1s')).toBe(2 / 5);
    expect(read('#8 DONE 0.1s')).toBe(4 / 5);
});

test('lines of no step leave the state unchanged', () => {
    const parser = createBuildProgressParser();
    parser.push('#4 [1/4] FROM docker.io/library/debian:trixie-slim');
    parser.push('#4 CACHED');
    const before = parser.fraction;

    for (const line of [
        '',
        '#1 [internal] load build definition from Containerfile',
        '#1 DONE 0.0s',
        '#4 resolve docker.io/library/debian:trixie-slim done',
        '#6 0.074 [3/4] looks like a header',
        '#6 DONE 1.1s',
        '#7 transferring context: 2B done',
        'unrelated text',
    ]) {
        parser.push(line);
        expect(parser.fraction).toBe(before);
    }
});

test('an errored step is not completed', () => {
    const parser = createBuildProgressParser();
    parser.push('#6 [2/4] RUN false');
    parser.push('#6 ERROR: process "/bin/sh -c false" did not complete successfully');

    expect(parser.fraction).toBe(0);
});

test('reads a stage prefix and a trailing carriage return', () => {
    const parser = createBuildProgressParser();
    parser.push('#4 [stage-0 2/9] RUN make\r');
    parser.push('#4 DONE 2.0s\r');

    expect(parser.fraction).toBe(1 / 10);
});

test('is 0 before any step is seen', () => {
    const parser = createBuildProgressParser();
    parser.push('#1 [internal] load build definition from Containerfile');
    parser.push('#1 DONE 0.0s');

    expect(parser.fraction).toBe(0);
});
