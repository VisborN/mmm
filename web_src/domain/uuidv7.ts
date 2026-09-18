// Source - https://stackoverflow.com/a/79959344 
// Posted by daghan, modified by community. See post 'Timeline' for change history 
// Retrieved 2026-09-18, License - CC BY-SA 4.0 
// Enhanced with monotonic sequence counter for strict intra-millisecond sorting (RFC 9562).

let lastMs = 0;
let seq = 0;

export function uuidv7(): string {
    const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : crypto;
    let now = Date.now();
    if (now <= lastMs) {
        now = lastMs;
        seq = (seq + 1) & 0xfff;
        if (seq === 0) {
            now = lastMs + 1;
        }
    } else {
        seq = Math.floor(Math.random() * 0x800);
    }
    lastMs = now;

    const timeMillisHex = now.toString(16).padStart(12, '0');
    const timeHigh = timeMillisHex.substring(0, 8);
    const timeLow = timeMillisHex.substring(8, 12);
    const seqHex = seq.toString(16).padStart(3, '0');
    // uuidv4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // substring(18, 36) gives: -yxxx-xxxxxxxxxxxx (containing RFC variant bits)
    const random = cryptoObj.randomUUID().substring(18, 36);
    return `${timeHigh}-${timeLow}-7${seqHex}${random}`;
}
