import { expect, test } from 'bun:test';

import { isPublicAddress } from './isPublicAddress.js';

test.each([
    // Unspecified
    '0.0.0.0',
    '0.255.255.255',
    // RFC 1918
    '10.0.0.0',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    // CGNAT
    '100.64.0.0',
    '100.127.255.255',
    // Loopback
    '127.0.0.1',
    '127.255.255.254',
    // Link-local
    '169.254.0.1',
    '169.254.169.254',
    // Multicast, reserved and broadcast
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    // IPv6 unspecified and loopback
    '::',
    '::1',
    '0:0:0:0:0:0:0:1',
    // Unique local
    'fc00::1',
    'fd12:3456::1',
    'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    // Link-local, with and without a zone id
    'fe80::1',
    'fe80::1%lo0',
    'febf:ffff::1',
    // Multicast
    'ff02::1',
    // IPv4-mapped and IPv4-compatible forms of private addresses
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:c0a8:101',
    '0:0:0:0:0:ffff:169.254.169.254',
    '::127.0.0.1',
    '::7f00:1',
    // NAT64 of a private address
    '64:ff9b::192.168.1.1',
    // Not an address
    '',
    'localhost',
    '1.2.3',
    '256.1.1.1',
    '[::1]',
])('refuses %p', address => {
    expect(isPublicAddress(address)).toBe(false);
});

test.each([
    '1.1.1.1',
    '8.8.8.8',
    '2606:4700::1111',
    '2001:4860:4860::8888',
    // Just outside each IPv4 range
    '1.0.0.0',
    '9.255.255.255',
    '11.0.0.0',
    '100.63.255.255',
    '100.128.0.0',
    '126.255.255.255',
    '128.0.0.0',
    '169.253.255.255',
    '169.255.0.0',
    '172.15.255.255',
    '172.32.0.0',
    '192.167.255.255',
    '192.169.0.0',
    '223.255.255.255',
    // Just outside each IPv6 range
    'fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    'fe00::1',
    'fec0::1',
    'feff:ffff::1',
    // Mapped, compatible and NAT64 forms of a public address
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '64:ff9b::1.1.1.1',
])('allows %p', address => {
    expect(isPublicAddress(address)).toBe(true);
});
