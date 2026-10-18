import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'resources', 'parts');
const maxDimension = 512;
const maxObjectsTotal = 420;
const minAlpha = 1;
const minWidth = 10;
const minHeight = 10;
const minPixels = 70;

// PNG textures from a public decompilation of the original Bad Piggies game.
// These are used only at build time; no substitute/drawn assets are generated.
const sources = [
  {
    name: 'ingame-original-1',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/IngameAtlas.png'
  },
  {
    name: 'ingame-original-2',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/IngameAtlas2.png'
  },
  {
    name: 'ingame-original-3',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/IngameAtlas3.png'
  },
  {
    name: 'ingame-original-4',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/IngameAtlas4_Original.png'
  },
  {
    name: 'wheel-original',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/Wheel.png'
  },
  {
    name: 'parts-button-original',
    url: 'https://raw.githubusercontent.com/Goggs77/bp-rebooted/master/Assets/Texture2D/UIPartButtonAtlas.png'
  }
];

async function fetchAtlas(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'BadPiggiesObjects-Geode-Build/1.3' },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    throw new Error('Failed to fetch original texture "' + source.name + '" (HTTP ' + response.status + '): ' + source.url);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width < 16 || decoded.info.height < 16) {
    throw new Error('Texture "' + source.name + '" has unexpected dimensions: ' +
      decoded.info.width + 'x' + decoded.info.height);
  }
  console.log('Fetched ' + source.name + ': ' + decoded.info.width + 'x' +
    decoded.info.height + ', ' + bytes.length + ' bytes.');
  return {
    source: source.name,
    url: source.url,
    raw: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    sourceBytes: bytes.length
  };
}

function findComponents(raw, width, height) {
  const count = width * height;
  const labels = new Uint32Array(count);
  const queue = new Int32Array(count);
  const components = [];
  let nextLabel = 0;
  const alphaAt = (index) => raw[index * 4 + 3];

  for (let start = 0; start < count; start++) {
    if (labels[start] !== 0 || alphaAt(start) < minAlpha) continue;
    nextLabel++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextLabel;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const n = index - 1;
        if (labels[n] === 0 && alphaAt(n) >= minAlpha) {
          labels[n] = nextLabel;
          queue[tail++] = n;
        }
      }
      if (x + 1 < width) {
        const n = index + 1;
        if (labels[n] === 0 && alphaAt(n) >= minAlpha) {
          labels[n] = nextLabel;
          queue[tail++] = n;
        }
      }
      if (y > 0) {
        const n = index - width;
        if (labels[n] === 0 && alphaAt(n) >= minAlpha) {
          labels[n] = nextLabel;
          queue[tail++] = n;
        }
      }
      if (y + 1 < height) {
        const n = index + width;
        if (labels[n] === 0 && alphaAt(n) >= minAlpha) {
          labels[n] = nextLabel;
          queue[tail++] = n;
        }
      }
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w >= minWidth && h >= minHeight && tail >= minPixels &&
        w <= maxDimension && h <= maxDimension) {
      components.push({
        label: nextLabel, x: minX, y: minY, width: w, height: h, pixels: tail
      });
    }
  }

  components.sort((a, b) => b.pixels - a.pixels);
  return { labels, components };
}

function generatedSource(parts) {
  const lines = [
    '#include <Geode/Geode.hpp>',
    '#include <smjs.object-collab/include/object_collab.hpp>',
    '',
    'using namespace geode::prelude;',
    'using namespace object_collab::prelude;',
    '',
    '// Generated from the original game texture atlases during the build.',
    '$on_mod(Loaded) {',
    '    if (!Mod::get()->getSettingValue<bool>("show-original-parts")) return;',
    '    // Each original sprite region is an individually placeable decoration.'
  ];

  for (const part of parts) {
    lines.push(
      '    ObjectAPI::registerObject(ObjectInfo::builder()',
      '        .id("' + part.id + '"_spr)',
      '        .sprite("' + part.frame + '"_spr)',
      '        .construction(QuickObject::builder()',
      '            .objectType(GameObjectType::Decoration)',
      '            .defaultZLayer(ZLayer::Default)',
      '            .defaultZOrder(2)',
      '            .build())',
      '        .editorTab(EditorTab::Decorations)',
      '        .build());'
    );
  }

  lines.push('}', '');
  return lines.join('\n');
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  for (const name of await fs.readdir(outputDir)) {
    if (name.toLowerCase().endsWith('.png')) {
      await fs.unlink(path.join(outputDir, name));
    }
  }

  const parts = [];
  const skippedSources = [];

  for (const source of sources) {
    const atlas = await fetchAtlas(source);
    const found = findComponents(atlas.raw, atlas.width, atlas.height);
    // Each atlas has its own 4-connected-component labels; only regions with
    // independent non-transparent pixels are eligible for sprite extraction.
    if (found.components.length === 0) {
      skippedSources.push({ source: source.name, reason: 'No independent transparent sprite regions found.' });
      continue;
    }

    const available = maxObjectsTotal - parts.length;
    if (available <= 0) break;
    const selected = found.components.slice(0, Math.min(available, 120));

    for (const region of selected) {
      const ordinal = String(parts.length + 1).padStart(3, '0');
      const rgba = Buffer.alloc(region.width * region.height * 4);

      for (let yy = 0; yy < region.height; yy++) {
        for (let xx = 0; xx < region.width; xx++) {
          const srcIndex = (region.y + yy) * atlas.width + region.x + xx;
          if (found.labels[srcIndex] !== region.label) continue;
          const from = srcIndex * 4;
          const to = (yy * region.width + xx) * 4;
          atlas.raw.copy(rgba, to, from, from + 4);
        }
      }

      const fileName = 'bp-original-' + ordinal + '.png';
      await sharp(rgba, {
        raw: { width: region.width, height: region.height, channels: 4 }
      }).png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(path.join(outputDir, fileName));

      parts.push({
        id: 'bp-object-' + ordinal,
        frame: fileName,
        source: atlas.source,
        sourceUrl: atlas.url,
        sourceAtlasRect: [region.x, region.y, region.width, region.height],
        visiblePixelCount: region.pixels,
        spriteSize: [region.width, region.height]
      });
    }

    console.log('Extracted ' + selected.length + ' regions from ' + source.name + '.');
  }

  if (parts.length < 20) {
    throw new Error('Only ' + parts.length + ' independent sprite regions were recovered; refusing to package an empty or broken mod.');
  }

  await fs.writeFile(
    path.join(root, 'src', 'generated_parts.cpp'),
    generatedSource(parts)
  );
  await fs.writeFile(path.join(root, 'original_parts_manifest.json'), JSON.stringify({
    purpose: 'Original Bad Piggies game artwork as Geometry Dash editor decorations',
    count: parts.length,
    limits: { maxDimension, maxObjectsTotal, minWidth, minHeight, minPixels },
    extraction: 'Transparent connected components; original RGBA colors and alpha are preserved without drawing substitutes.',
    skippedSources,
    parts
  }, null, 2));
  console.log('SUCCESS: generated ' + parts.length +
    ' original Bad Piggies sprite objects from public raw texture files.');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
