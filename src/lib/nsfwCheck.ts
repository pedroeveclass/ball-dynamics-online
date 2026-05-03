// Client-side NSFW guard for uploaded background images. Runs the
// nsfwjs MobileNet model entirely in the browser before the file leaves
// the client. The check is the first layer (cheap, deters casual abuse);
// human "Reportar" review is the second layer for anything that gets
// past it.
//
// Model load is lazy (~5 MB) and cached for the rest of the session.

import * as nsfwjs from 'nsfwjs';

let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;

function loadModel() {
  if (!modelPromise) {
    // The default model URL bundled with nsfwjs is the MobileNet v2 224
    // variant — small + fast and good enough for porn/sexy detection.
    modelPromise = nsfwjs.load();
  }
  return modelPromise;
}

export interface NsfwResult {
  ok: boolean;
  flagged: 'Porn' | 'Hentai' | 'Sexy' | null;
  probability: number;
  predictions: { className: string; probability: number }[];
}

// Block thresholds tuned to be a bit conservative — false negatives are
// caught by the report flow; false positives just ask the user to pick
// another image, which is cheap.
const BLOCK_THRESHOLDS: Record<string, number> = {
  Porn: 0.5,
  Hentai: 0.5,
  Sexy: 0.6,
};

export async function checkNsfw(file: File): Promise<NsfwResult> {
  const model = await loadModel();
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load image for NSFW check'));
      i.src = url;
    });

    const predictions = await model.classify(img);
    let flagged: NsfwResult['flagged'] = null;
    let probability = 0;
    for (const p of predictions) {
      const threshold = BLOCK_THRESHOLDS[p.className];
      if (threshold != null && p.probability >= threshold) {
        if (p.probability > probability) {
          flagged = p.className as NsfwResult['flagged'];
          probability = p.probability;
        }
      }
    }
    return { ok: flagged === null, flagged, probability, predictions };
  } finally {
    URL.revokeObjectURL(url);
  }
}
