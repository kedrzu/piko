import { defineService } from '@nzyme/ioc/Service.js';
import { createOpenApiFetch } from '@nzyme/openapi/openapi-fetch.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import type { paths } from './schema.gen.js';

/**
 * OpenCode's HTTP API (`/api/*`), typed from its OpenAPI spec. Only the `Opencode*Command`s call it. The password
 * lives only in the `Authorization` header built per request: never in a URL, an error or a log entry. An object query
 * parameter (`location`) goes in OpenCode's `deepObject` form, `location[directory]=…`.
 */
export const OpencodeClient = defineService({
    name: 'OpencodeClient',
    deps: { connection: OpencodeConnection },
    setup({ connection }) {
        return createOpenApiFetch<paths>({ fetch: fetchOpencode });

        function fetchOpencode(input: string | Request | URL, init?: RequestInit) {
            const endpoint = connection.getEndpoint();
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`);
            const path = input instanceof Request ? input.url : input;
            return fetch(toDeepObjectQuery(new URL(path, endpoint.url)), { ...init, headers });
        }
    },
});

/**
 * The URL with the `location` query parameter, the only object one OpenCode's spec declares, in the `deepObject` form
 * it reads (`location[directory]=…`, `null` as `null`). The typed fetch sends an object as JSON, which OpenCode does not
 * read.
 */
function toDeepObjectQuery(url: URL) {
    const location = url.searchParams.get('location');
    if (location === null) {
        return url;
    }
    const result = new URL(url);
    result.searchParams.delete('location');
    for (const [key, value] of Object.entries(JSON.parse(location) as Record<string, string | null>)) {
        result.searchParams.append(`location[${key}]`, value ?? 'null');
    }
    return result;
}
