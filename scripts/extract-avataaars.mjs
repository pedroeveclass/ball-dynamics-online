// One-shot extractor for the @dicebear/avataaars asset library.
//
// DiceBear ships variants as JS objects whose values are functions
// that return SVG path fragments. This script invokes each variant
// with placeholder colour tokens (__SKIN__, __HAIR__, etc.) and
// writes one standalone .svg per variant under avatar-redesign/face/
// so they can be edited in any vector editor and re-loaded by our
// own composer (Round 2).
//
// Run from the repo root:  node scripts/extract-avataaars.mjs
//
// Each variant's SVG is wrapped in a 0 0 280 280 viewBox — same as
// DiceBear's internal canvas — so coordinates inside each file are
// already aligned to where the composer will place them.

import fs from 'node:fs';
import path from 'node:path';

const baseMod        = await import('../node_modules/@dicebear/avataaars/lib/components/base.js');
const eyesMod        = await import('../node_modules/@dicebear/avataaars/lib/components/eyes.js');
const eyebrowsMod    = await import('../node_modules/@dicebear/avataaars/lib/components/eyebrows.js');
const mouthMod       = await import('../node_modules/@dicebear/avataaars/lib/components/mouth.js');
const noseMod        = await import('../node_modules/@dicebear/avataaars/lib/components/nose.js');
const topMod         = await import('../node_modules/@dicebear/avataaars/lib/components/top.js');
const facialHairMod  = await import('../node_modules/@dicebear/avataaars/lib/components/facialHair.js');
const accessoriesMod = await import('../node_modules/@dicebear/avataaars/lib/components/accessories.js');
const clothingMod    = await import('../node_modules/@dicebear/avataaars/lib/components/clothing.js');

// Placeholder colour tokens — the variant functions interpolate
// `${colors.skin}` etc. directly into the SVG string. By feeding
// them static tokens the resulting SVGs become editable templates
// that the runtime composer rewrites with the player's chosen
// colours via simple string replace.
const placeholderColors = {
  skin:       '__SKIN__',
  hair:       '__HAIR__',
  hat:        '__HAT__',
  facialHair: '__FACIAL_HAIR__',
  accessories:'__ACCESSORY__',
  clothes:    '__CLOTHES__',
};

const slots = {
  eyes:        eyesMod.eyes,
  eyebrows:    eyebrowsMod.eyebrows,
  mouth:       mouthMod.mouth,
  nose:        noseMod.nose,
  top:         topMod.top,
  facialHair:  facialHairMod.facialHair,
  accessories: accessoriesMod.accessories,
  clothing:    clothingMod.clothing,
};

const outDir = path.resolve('avatar-redesign/face');
fs.mkdirSync(outDir, { recursive: true });

function wrapSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280">${inner}</svg>\n`;
}

// 1. Base — head silhouette + neck shadow + empty placeholder
//    groups for each slot. The composer will compose ON TOP of
//    this, not inject INTO it.
const baseDir = path.join(outDir, 'base');
fs.mkdirSync(baseDir, { recursive: true });
const baseInner = baseMod.base.default({}, placeholderColors);
fs.writeFileSync(path.join(baseDir, 'head.svg'), wrapSvg(baseInner));
console.log(`base/head.svg written (head silhouette + skin token)`);

// 2. Each slot — one .svg per variant.
let totalVariants = 0;
for (const [slotName, variants] of Object.entries(slots)) {
  const slotDir = path.join(outDir, slotName);
  fs.mkdirSync(slotDir, { recursive: true });
  let count = 0;
  for (const [variantName, fn] of Object.entries(variants)) {
    const inner = fn({}, placeholderColors);
    fs.writeFileSync(path.join(slotDir, `${variantName}.svg`), wrapSvg(inner));
    count++;
  }
  totalVariants += count;
  console.log(`${slotName}: ${count} variants`);
}

console.log(`\nDone — ${totalVariants} variants + 1 base = ${totalVariants + 1} files`);
console.log(`Output: ${outDir}`);
