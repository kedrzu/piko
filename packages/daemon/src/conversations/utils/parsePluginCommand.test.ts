import { expect, test } from 'bun:test';

import type { PluginCommand } from './parsePluginCommand.js';
import { parsePluginCommand } from './parsePluginCommand.js';

test.each<[string, PluginCommand]>([
    ['/gmail:read-mail', { plugin: 'gmail', skill: 'read-mail' }],
    ['/email-sorting:sort the inbox', { plugin: 'email-sorting', skill: 'sort' }],
    ['/gmail:connect\nplease', { plugin: 'gmail', skill: 'connect' }],
])('reads the command in %j', (text, expected) => {
    expect(parsePluginCommand(text)).toEqual(expected);
});

test.each([
    'read my mail',
    '/init',
    '/gmail',
    ' /gmail:read-mail',
    'please /gmail:read-mail',
    '/gmail:read-mail:more',
    '/gmail:read-mail,now',
    '/Gmail:read-mail',
    '/gmail:',
    '/:read-mail',
    '/gmail:read--mail',
])('reads %j as an ordinary message', text => {
    expect(parsePluginCommand(text)).toBeUndefined();
});
