export const FRAME_SYNC_FULL = 0x00;
export const FRAME_SYNC_UPDATE = 0x01;
export const FRAME_AWARENESS = 0x02;

export function buildFrame(type, payloadBytes) {
  const frame = new Uint8Array(payloadBytes.length + 1);
  frame[0] = type;
  frame.set(payloadBytes, 1);
  return frame;
}

export function parseFrame(bufferOrArrayBuffer) {
  const view = bufferOrArrayBuffer instanceof ArrayBuffer
    ? new Uint8Array(bufferOrArrayBuffer)
    : new Uint8Array(bufferOrArrayBuffer);

  if (view.length === 0) {
    return { type: -1, payload: new Uint8Array(0) };
  }

  return {
    type: view[0],
    payload: view.subarray(1),
  };
}

export function readUint32BE(view, offset) {
  return (
    (view[offset] << 24) |
    (view[offset + 1] << 16) |
    (view[offset + 2] << 8) |
    view[offset + 3]
  ) >>> 0;
}

export function loadUpdateFixtures(buffer) {
  const view = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer);
  const updates = [];
  let offset = 0;

  while (offset + 4 <= view.length) {
    const length = readUint32BE(view, offset);
    offset += 4;
    if (offset + length > view.length) {
      break;
    }
    updates.push(view.subarray(offset, offset + length));
    offset += length;
  }

  return updates;
}

export function loadUpdateBatches(buffer) {
  const view = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer);

  if (view.length < 4) return [];

  let offset = 0;
  const numBatches = readUint32BE(view, offset);
  offset += 4;

  const batches = [];
  for (let b = 0; b < numBatches; b += 1) {
    if (offset + 4 > view.length) break;
    const batchSize = readUint32BE(view, offset);
    offset += 4;

    const batch = [];
    for (let i = 0; i < batchSize; i += 1) {
      if (offset + 4 > view.length) break;
      const length = readUint32BE(view, offset);
      offset += 4;
      if (offset + length > view.length) break;
      batch.push(view.subarray(offset, offset + length));
      offset += length;
    }
    batches.push(batch);
  }

  return batches;
}
