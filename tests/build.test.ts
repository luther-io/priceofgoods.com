import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";

const outputDirectory = path.resolve("dist");

async function builtPages() {
  const entries = await readdir(outputDirectory, { recursive: true, withFileTypes: true });
  const pages = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html"));
  assert.ok(pages.length > 0, "Run pnpm run build before these tests");
  return pages;
}

test("generated social previews are distinct, not shared error images", async () => {
  const directory = path.join(outputDirectory, "og-image");
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const images = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".png"));
  assert.ok(images.length > 0, "Run pnpm run build before these tests");
  const hashes = new Map<string, string>();

  for (const image of images) {
    const filename = path.join(image.parentPath, image.name);
    const buffer = await readFile(filename);
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.width, 1200, filename);
    assert.equal(metadata.height, 600, filename);
    const hash = createHash("sha256").update(buffer).digest("hex");
    assert.ok(!hashes.has(hash), `${filename} duplicates ${hashes.get(hash)}`);
    hashes.set(hash, filename);
  }
});

test("every page references an existing social preview", async () => {
  for (const page of await builtPages()) {
    const filename = path.join(page.parentPath, page.name);
    const html = await readFile(filename, "utf8");
    const image = html.match(/<meta property="og:image" content="([^"]+)"/);
    assert.ok(image, `Missing social preview metadata: ${filename}`);
    const imagePath = decodeURIComponent(new URL(image[1]).pathname).replace(/^\/+/, "");
    await readFile(path.join(outputDirectory, imagePath));
  }
});

test("React islands include their generated component and renderer assets", async () => {
  let islandCount = 0;

  for (const page of await builtPages()) {
    const html = await readFile(path.join(page.parentPath, page.name), "utf8");
    for (const island of html.matchAll(/<astro-island\b[^>]*>/g)) {
      islandCount++;
      for (const attribute of ["component-url", "renderer-url"]) {
        const asset = island[0].match(new RegExp(`${attribute}="([^"]+)"`));
        assert.ok(asset, `Missing ${attribute} in ${page.name}`);
        await readFile(path.join(outputDirectory, asset[1].replace(/^\/+/, "")));
      }
    }
  }

  assert.ok(islandCount > 0, "Expected hydrated React components");
});
