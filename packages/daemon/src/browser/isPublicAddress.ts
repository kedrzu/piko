import { isIPv4, isIPv6 } from 'node:net';

/** An address range: its first bytes, compared up to `bits`. */
interface AddressRange {
    bytes: number[];
    bits: number;
}

/**
 * IPv4 addresses that are not on the public internet: unspecified (`0.0.0.0/8`), RFC 1918, CGNAT (Tailscale uses it),
 * loopback, link-local (cloud metadata answers there), multicast and the reserved block up to the broadcast address.
 */
const NON_PUBLIC_IPV4 = [
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '224.0.0.0/4',
    '240.0.0.0/4',
].map(parseRange);

/** IPv6 addresses that are not on the public internet: unique local, link-local and multicast. */
const NON_PUBLIC_IPV6 = ['fc00::/7', 'fe80::/10', 'ff00::/8'].map(parseRange);

/**
 * IPv6 prefixes whose last 32 bits are an IPv4 address the connection ends up at: IPv4-mapped, IPv4-compatible (which
 * also holds `::` and `::1`) and NAT64. The embedded address decides.
 */
const EMBEDDING_IPV4 = ['::ffff:0:0/96', '::/96', '64:ff9b::/96'].map(parseRange);

/**
 * Whether an IP address is on the public internet, so the agent's browser may connect to it. Anything that is not a
 * valid IPv4 or IPv6 address counts as not public.
 * @__NO_SIDE_EFFECTS__
 */
export function isPublicAddress(address: string): boolean {
    const bytes = parseAddress(address);
    if (!bytes) {
        return false;
    }
    if (bytes.length === 4) {
        return !NON_PUBLIC_IPV4.some(range => inRange(bytes, range));
    }
    if (EMBEDDING_IPV4.some(range => inRange(bytes, range))) {
        return !NON_PUBLIC_IPV4.some(range => inRange(bytes.slice(12), range));
    }
    return !NON_PUBLIC_IPV6.some(range => inRange(bytes, range));
}

/** The address's bytes: 4 for IPv4, 16 for IPv6 (a zone id such as `%en0` dropped); `null` when it is neither. */
function parseAddress(address: string): number[] | null {
    if (isIPv4(address)) {
        return address.split('.').map(Number);
    }
    const withoutZone = address.split('%')[0] ?? '';
    if (!isIPv6(withoutZone)) {
        return null;
    }
    return parseIPv6(withoutZone);
}

/** Expands a valid IPv6 address, `::` and a trailing dotted IPv4 part included, into 16 bytes. */
function parseIPv6(address: string): number[] {
    const [head = '', tail] = address.split('::');
    const headGroups = toGroups(head);
    const tailGroups = tail == null ? [] : toGroups(tail);
    const zeros: number[] = Array.from({ length: 8 - headGroups.length - tailGroups.length }, () => 0);
    const bytes: number[] = [];
    for (const group of [...headGroups, ...zeros, ...tailGroups]) {
        bytes.push(group >> 8, group & 0xff);
    }
    return bytes;
}

/** Reads `a:b:c` into 16-bit groups; a dotted IPv4 last part gives two groups. */
function toGroups(part: string): number[] {
    if (!part) {
        return [];
    }
    const groups: number[] = [];
    for (const piece of part.split(':')) {
        if (piece.includes('.')) {
            const [a = 0, b = 0, c = 0, d = 0] = piece.split('.').map(Number);
            groups.push((a << 8) | b, (c << 8) | d);
        } else {
            groups.push(Number.parseInt(piece, 16));
        }
    }
    return groups;
}

function parseRange(cidr: string): AddressRange {
    const [address = '', bits = ''] = cidr.split('/');
    const bytes = parseAddress(address);
    if (!bytes) {
        throw new Error(`Invalid range: ${cidr}`);
    }
    return { bytes, bits: Number(bits) };
}

function inRange(bytes: number[], range: AddressRange): boolean {
    if (bytes.length !== range.bytes.length) {
        return false;
    }
    for (let bit = 0; bit < range.bits; bit += 8) {
        const mask = range.bits - bit >= 8 ? 0xff : (0xff << (8 - (range.bits - bit))) & 0xff;
        if (((bytes[bit / 8] ?? 0) & mask) !== ((range.bytes[bit / 8] ?? 0) & mask)) {
            return false;
        }
    }
    return true;
}
