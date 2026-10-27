const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

const rotateRight = (value: number, amount: number) => ((value >>> amount) | (value << (32 - amount))) >>> 0;

/** A small streaming SHA-256 implementation so large PMTiles are never buffered in full. */
export class IncrementalSha256 {
  readonly #state = new Uint32Array(INITIAL_STATE);
  readonly #buffer = new Uint8Array(64);
  readonly #words = new Uint32Array(64);
  #bufferLength = 0;
  #bytesHashed = 0;
  #finished = false;

  update(bytes: Uint8Array) {
    if (this.#finished) throw new Error("sha256_already_finalized");
    if (!(bytes instanceof Uint8Array)) throw new TypeError("sha256_requires_uint8array");
    if (this.#bytesHashed + bytes.byteLength > Number.MAX_SAFE_INTEGER / 8) throw new Error("sha256_input_too_large");
    this.#bytesHashed += bytes.byteLength;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const take = Math.min(64 - this.#bufferLength, bytes.byteLength - offset);
      this.#buffer.set(bytes.subarray(offset, offset + take), this.#bufferLength);
      this.#bufferLength += take;
      offset += take;
      if (this.#bufferLength === 64) {
        this.#compress(this.#buffer);
        this.#bufferLength = 0;
      }
    }
    return this;
  }

  digestHex() {
    this.#finish();
    return Array.from(this.#state, (word) => word.toString(16).padStart(8, "0")).join("");
  }

  #finish() {
    if (this.#finished) return;
    this.#finished = true;
    this.#buffer[this.#bufferLength++] = 0x80;
    if (this.#bufferLength > 56) {
      this.#buffer.fill(0, this.#bufferLength);
      this.#compress(this.#buffer);
      this.#bufferLength = 0;
    }
    this.#buffer.fill(0, this.#bufferLength, 56);
    const bitLengthHigh = Math.floor(this.#bytesHashed / 0x20000000);
    const bitLengthLow = (this.#bytesHashed * 8) >>> 0;
    this.#buffer[56] = bitLengthHigh >>> 24;
    this.#buffer[57] = bitLengthHigh >>> 16;
    this.#buffer[58] = bitLengthHigh >>> 8;
    this.#buffer[59] = bitLengthHigh;
    this.#buffer[60] = bitLengthLow >>> 24;
    this.#buffer[61] = bitLengthLow >>> 16;
    this.#buffer[62] = bitLengthLow >>> 8;
    this.#buffer[63] = bitLengthLow;
    this.#compress(this.#buffer);
    this.#bufferLength = 0;
  }

  #compress(chunk: Uint8Array) {
    const words = this.#words;
    for (let index = 0; index < 16; index += 1) {
      const offset = index * 4;
      words[index] = (
        (chunk[offset] << 24)
        | (chunk[offset + 1] << 16)
        | (chunk[offset + 2] << 8)
        | chunk[offset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.#state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    this.#state[0] = (this.#state[0] + a) >>> 0;
    this.#state[1] = (this.#state[1] + b) >>> 0;
    this.#state[2] = (this.#state[2] + c) >>> 0;
    this.#state[3] = (this.#state[3] + d) >>> 0;
    this.#state[4] = (this.#state[4] + e) >>> 0;
    this.#state[5] = (this.#state[5] + f) >>> 0;
    this.#state[6] = (this.#state[6] + g) >>> 0;
    this.#state[7] = (this.#state[7] + h) >>> 0;
  }
}

export async function sha256ReadableStream(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<{ bytes: number; sha256: string }> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("invalid_sha256_stream_limit");
  const reader = stream.getReader();
  const hasher = new IncrementalSha256();
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw new Error("invalid_sha256_stream_chunk");
      bytes += result.value.byteLength;
      if (bytes > maximumBytes) throw new Error("sha256_stream_too_large");
      hasher.update(result.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { bytes, sha256: hasher.digestHex() };
}
