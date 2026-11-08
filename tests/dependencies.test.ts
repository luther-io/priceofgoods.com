import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";

test("unused AI dependencies are absent from the manifest and lockfile", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const lockfile = await readFile("pnpm-lock.yaml", "utf8");

  for (const name of ["@langchain/anthropic", "@langchain/core", "langsmith"]) {
    assert.ok(!(name in manifest.dependencies), `${name} is still a direct dependency`);
    assert.ok(!lockfile.includes(`${name}@`), `${name} is still locked`);
  }
});

test("installed dependency copies meet the security baseline", () => {
  const minimumVersions: Record<string, string> = {
    ajv: "8.18.0",
    "fast-uri": "3.1.9",
    lodash: "4.18.0",
    "mdast-util-to-hast": "13.2.1",
    picomatch: "2.3.2",
    "postcss-selector-parser": "6.1.5",
    sharp: "0.35.5",
    "source-map-js": "1.2.2",
    zod: "4.6.7",
  };
  interface Dependency {
    version?: string;
    dependencies?: Record<string, Dependency>;
    devDependencies?: Record<string, Dependency>;
    optionalDependencies?: Record<string, Dependency>;
  }
  const projects: Dependency[] = JSON.parse(
    execFileSync("pnpm", ["list", "--depth", "Infinity", "--json"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }),
  );

  function visit(node: Dependency) {
    for (const dependencies of [node.dependencies, node.devDependencies, node.optionalDependencies]) {
      for (const [name, dependency] of Object.entries(dependencies ?? {})) {
        const minimum = minimumVersions[name];
        if (minimum) {
          assert.ok(dependency.version, `Missing version for ${name}`);
          const installed = dependency.version.split(".").slice(0, 3).map(Number);
          assert.ok(installed.length === 3 && installed.every(Number.isFinite), `Invalid version for ${name}`);
          const required = minimum.split(".").map(Number);
          const difference = installed.findIndex((part, index) => part !== required[index]);
          assert.ok(
            difference === -1 || installed[difference] > required[difference],
            `${name}@${dependency.version} is below ${minimum}`,
          );
        }
        visit(dependency);
      }
    }
  }

  projects.forEach(visit);
});

test("the Anthropic SDK parses a mocked response with the installed Zod", async () => {
  const schema = z.object({ summary: z.string() });
  let requests = 0;
  const client = new Anthropic({
    apiKey: "test-key-not-a-real-credential",
    maxRetries: 0,
    fetch: async (input, init) => {
      requests++;
      assert.equal(new URL(String(input)).pathname, "/v1/messages");
      assert.equal(init?.method, "POST");
      return Response.json({
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "text", text: '{"summary":"Prices are stable."}' }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 128,
    messages: [{ role: "user", content: "Summarize the price trend." }],
    output_config: { format: zodOutputFormat(schema) },
  });

  assert.equal(requests, 1);
  assert.deepEqual(response.parsed_output, { summary: "Prices are stable." });
});

test("Sharp rasterizes SVG social previews", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#4299e1"/></svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const metadata = await sharp(png).metadata();

  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 600);
});
