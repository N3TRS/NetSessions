#!/usr/bin/env node
/*
 * Pre-genera updates Yjs binarios para que k6 los reproduzca.
 *
 * Estrategia: genera BATCHES streams independientes (cada uno con su propio
 * Y.Doc y clientID único). Cada batch contiene COUNT updates incrementales
 * que el servidor puede aplicar en orden y disparar `doc.on('update')` para
 * propagar broadcast a los demás peers.
 *
 * Cada VU de k6 consume UN solo batch desde index 0 hacia adelante, evitando
 * "pending structs" en el lado servidor (lo que ocurriría al saltarse updates
 * intermedios de un mismo cliente Yjs).
 *
 * Formato binario:
 *   [num_batches:uint32_be]
 *   por cada batch:
 *     [batch_size:uint32_be]
 *     por cada update:
 *       [update_len:uint32_be][update_bytes]
 *
 * Uso:
 *   node fixtures/generate-yjs-updates.mjs
 *   BATCHES=100 COUNT=2000 node fixtures/generate-yjs-updates.mjs
 *
 * Pre-requisito: la dependencia `yjs` debe estar instalada en el repo raíz
 * (ya viene como dependency del servicio).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as Y from 'yjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, 'yjs-updates.bin');
const COUNT = Number(process.env.COUNT ?? 1000);
const BATCHES = Number(process.env.BATCHES ?? 300);

function uint32BE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n >>> 0, 0);
  return buf;
}

function generateBatch(count) {
  const doc = new Y.Doc();
  const text = doc.getText('content');
  const captured = [];

  doc.on('update', (update) => {
    captured.push(Buffer.from(update));
  });

  for (let i = 0; i < count; i += 1) {
    const ch = String.fromCharCode(97 + (i % 26));
    text.insert(i, ch);
  }

  return captured;
}

function main() {
  console.log(`Generating ${BATCHES} batches x ${COUNT} updates...`);
  const chunks = [];
  chunks.push(uint32BE(BATCHES));

  let totalUpdates = 0;
  let payloadBytes = 0;
  for (let b = 0; b < BATCHES; b += 1) {
    const batch = generateBatch(COUNT);
    chunks.push(uint32BE(batch.length));
    for (const upd of batch) {
      chunks.push(uint32BE(upd.length));
      chunks.push(upd);
      payloadBytes += upd.length;
    }
    totalUpdates += batch.length;
  }

  const finalBuf = Buffer.concat(chunks);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, finalBuf);

  console.log(
    `Wrote ${BATCHES} batches, ${totalUpdates} updates total ` +
      `(${finalBuf.length} bytes file, ${payloadBytes} bytes payload) ` +
      `to ${OUTPUT_PATH}`,
  );
}

main();
