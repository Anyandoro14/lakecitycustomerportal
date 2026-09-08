import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { loadEnv } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edgeServeAbs = resolve(projectRoot, "src/lib/mcp/edge-serve.ts");
const outFile = resolve(projectRoot, "supabase/functions/mcp/index.ts");
const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const versions = {
  ...pkg.peerDependencies,
  ...pkg.devDependencies,
  ...pkg.dependencies,
};
const mcpJsVersion = String(versions["@lovable.dev/mcp-js"] ?? "0.22.2").replace(/^[^\d]*/, "") || "0.22.2";

function npmSpecifierFor(bare) {
  const pkgName = bare.startsWith("@") ? bare.split("/").slice(0, 2).join("/") : bare.split("/")[0];
  const subpath = bare.slice(pkgName.length);
  if (pkgName === "@lovable.dev/mcp-js") return `npm:${pkgName}@${mcpJsVersion}${subpath}`;
  const range = versions[pkgName];
  const version = range && /^[\dv^~>=]|^latest$/.test(range) ? range : undefined;
  return version ? `npm:${pkgName}@${version}${subpath}` : `npm:${pkgName}${subpath}`;
}

const inlineEnv = {
  ...loadEnv("production", projectRoot, "VITE_"),
  MODE: "production",
  BASE_URL: "/",
  DEV: false,
  PROD: true,
  SSR: false,
};
if (!inlineEnv.VITE_SUPABASE_PROJECT_ID) {
  inlineEnv.VITE_SUPABASE_PROJECT_ID = "gumkxjeahojrcaqnosyz";
}

const defines = { "import.meta.env": JSON.stringify(inlineEnv) };
for (const [key, value] of Object.entries(inlineEnv)) {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) defines[`import.meta.env.${key}`] = JSON.stringify(value);
}

const result = await build({
  stdin: {
    contents: `import { createMcpFetchHandler } from ${JSON.stringify(edgeServeAbs)};
Deno.serve(createMcpFetchHandler());
`,
    resolveDir: projectRoot,
    sourcefile: "standledger-mcp-supabase-entry.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "esnext",
  absWorkingDir: projectRoot,
  logLevel: "silent",
  define: defines,
  plugins: [
    {
      name: "externalize-bare-as-npm",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /.*/ }, (args) => {
          const p = args.path;
          if (p.startsWith(".") || p.startsWith("/")) return null;
          if (/^(npm|node|jsr|https?|data):/.test(p)) {
            return { path: p, external: true };
          }
          return { path: npmSpecifierFor(p), external: true };
        });
      },
    },
  ],
});

const banner = `// StandLedger MCP Edge Function — bundled from src/lib/mcp by scripts/bundle-standledger-mcp.mjs.
// Accepts customer OAuth JWTs or the project LOVABLE_API_KEY.
// Bundled from ${relative(projectRoot, edgeServeAbs).split(sep).join("/")}.
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner + (result.outputFiles[0]?.text ?? ""));
console.log(`Wrote ${relative(projectRoot, outFile)}`);
