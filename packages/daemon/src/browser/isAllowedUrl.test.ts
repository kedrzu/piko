import { expect, test } from 'bun:test';

import { isAllowedUrl } from './isAllowedUrl.js';

test.each(['https://example.com/', 'http://example.com/path?q=1#x', 'HTTPS://Example.com/', 'about:blank'])(
    'allows %p',
    url => {
        expect(isAllowedUrl(url)).toBe(true);
    },
);

test.each([
    'file:///etc/passwd',
    'FiLe:///etc/passwd',
    'chrome://settings',
    'CHROME://version',
    'chrome-extension://abc/page.html',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com/',
    'data:text/html,<script>1</script>',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'blob:https://example.com/0f6c',
    'filesystem:https://example.com/temporary/x',
    'about:settings',
    'about:blank#x',
    'about:blank?x',
    'ABOUT:BLANK',
    ' https://example.com/',
    'https://example.com/ ',
    '\nfile:///etc/passwd',
    ' about:blank',
    '',
    'example.com',
    '//example.com/',
    undefined,
    null,
    42,
    { href: 'https://example.com/' },
    [['https://example.com/']],
])('refuses %p', url => {
    expect(isAllowedUrl(url)).toBe(false);
});
