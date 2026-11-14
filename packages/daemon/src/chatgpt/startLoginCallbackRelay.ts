/** Params of `startLoginCallbackRelay`. */
export interface StartLoginCallbackRelayParams {
    /** The port of the sign-in's `redirect_uri`, the one the sign-in waits on inside the sandbox. */
    port: number;
    /** The path of the `redirect_uri`, e.g. `/auth/callback`. */
    callbackPath: string;
    /** The sign-in's `state`: a callback carrying any other is not this sign-in's. */
    state: string;
    /**
     * Passes the callback on to the sign-in in the sandbox and returns the response for the browser. Receives the
     * callback's path and query, which carry the authorization code and `state`: never log them.
     */
    forward(pathAndQuery: string): Promise<Response>;
}

/** A running relay. */
export interface LoginCallbackRelay {
    /**
     * Closes the port to new connections, letting a response being sent finish; harmless when it is already closed.
     */
    stop(): void;
}

/**
 * Listens on `127.0.0.1:<port>` of the computer for the browser's return from a sign-in page, whose `redirect_uri`
 * points at a port that listens only inside the sandbox, and passes it on through `forward`. Accepts one `GET` of
 * `callbackPath` with the expected `state`; anything else is refused (404 for another path, such as the
 * `/favicon.ico` a browser asks for, 400 for another method or `state`) and the relay keeps waiting. Closes itself once
 * the callback is answered. Throws when the port is taken.
 */
export function startLoginCallbackRelay(params: StartLoginCallbackRelayParams): LoginCallbackRelay {
    let forwarded = false;
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: params.port,
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname !== params.callbackPath) {
                return new Response('Not found', { status: 404 });
            }
            if (request.method !== 'GET' || url.searchParams.get('state') !== params.state || forwarded) {
                return new Response('Bad request', { status: 400 });
            }

            forwarded = true;
            try {
                return await params.forward(`${url.pathname}${url.search}`);
            } finally {
                // Not forced: the response to this request is still sent; the port stops accepting new ones.
                void server.stop();
            }
        },
    });

    return {
        stop: () => void server.stop(),
    };
}
