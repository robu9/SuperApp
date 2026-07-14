import { createWorker, type Worker } from "tesseract.js";
import { OCR_ENABLED } from "../config.js";

let worker: Worker | null = null;
let workerReady = false;

async function ensureWorker(): Promise<Worker | null> {
  if (!OCR_ENABLED) return null;
  if (worker && workerReady) return worker;

  try {
    worker = await createWorker("eng");
    workerReady = true;
    return worker;
  } catch (err) {
    console.error("[ocr] failed to init tesseract:", err);
    return null;
  }
}

export async function runOcr(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  const ocrWorker = await ensureWorker();
  if (!ocrWorker) return { text: "", confidence: 0 };

  try {
    const result = await ocrWorker.recognize(imageBuffer);
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
    };
  } catch (err) {
    console.error("[ocr] recognition failed:", err);
    return { text: "", confidence: 0 };
  }
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerReady = false;
  }
}
