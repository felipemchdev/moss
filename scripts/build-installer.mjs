import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const packageJsonPath = path.join(repoRoot, "package.json");
const appCargoPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const appConfPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const bootstrapperCargoPath = path.join(
  repoRoot,
  "installer",
  "bootstrapper",
  "src-tauri",
  "Cargo.toml"
);
const bootstrapperConfPath = path.join(
  repoRoot,
  "installer",
  "bootstrapper",
  "src-tauri",
  "tauri.conf.json"
);
const nsisBundleDir = path.join(
  repoRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis"
);
const embeddedSetupPath = path.join(
  repoRoot,
  "installer",
  "bootstrapper",
  "src-tauri",
  "resources",
  "nsis",
  "moss-setup.exe"
);
const bootstrapperReleaseDir = path.join(
  repoRoot,
  "installer",
  "bootstrapper",
  "src-tauri",
  "target",
  "release"
);

function readCargoPackageVersion(tomlPath) {
  const raw = fs.readFileSync(tomlPath, "utf8");
  const lines = raw.split(/\r?\n/);
  let inPackage = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inPackage = trimmed === "[package]";
      continue;
    }
    if (!inPackage || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^version\s*=\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function validateVersions() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const appConf = JSON.parse(fs.readFileSync(appConfPath, "utf8"));
  const appCargoVersion = readCargoPackageVersion(appCargoPath);
  const bootstrapperConf = JSON.parse(
    fs.readFileSync(bootstrapperConfPath, "utf8")
  );
  const bootstrapperCargoVersion = readCargoPackageVersion(bootstrapperCargoPath);

  const versions = {
    "package.json": pkg.version,
    "src-tauri/Cargo.toml": appCargoVersion,
    "src-tauri/tauri.conf.json": appConf.version,
    "installer/bootstrapper/src-tauri/Cargo.toml": bootstrapperCargoVersion,
    "installer/bootstrapper/src-tauri/tauri.conf.json": bootstrapperConf.version,
  };

  for (const [label, ver] of Object.entries(versions)) {
    if (!ver || typeof ver !== "string") {
      throw new Error(`Missing version in ${label}`);
    }
  }

  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) {
    const summary = Object.entries(versions)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    throw new Error(`Version mismatch across manifests: ${summary}`);
  }

  console.log(`Validated matching version: ${pkg.version}`);
  return pkg.version;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}`
    );
  }
}

function findGeneratedNsisSetup(version) {
  if (!fs.existsSync(nsisBundleDir)) {
    throw new Error(`NSIS bundle directory not found: ${nsisBundleDir}`);
  }

  const preferredPath = path.join(
    nsisBundleDir,
    `moss_${version}_x64-setup.exe`
  );
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const prefix = `moss_${version}_`.toLowerCase();
  const candidates = fs
    .readdirSync(nsisBundleDir)
    .filter((name) => {
      const lower = name.toLowerCase();
      return lower.startsWith(prefix) && lower.endsWith("-setup.exe");
    })
    .map((name) => {
      const fullPath = path.join(nsisBundleDir, name);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) {
    throw new Error(
      `No NSIS setup matching version ${version} (${prefix}*-setup.exe) found in ${nsisBundleDir}`
    );
  }

  return candidates[0].fullPath;
}

function ensureFinalBinary() {
  const builtCargoExe = path.join(
    bootstrapperReleaseDir,
    "moss-bootstrapper.exe"
  );
  const targetInstallerExe = path.join(
    bootstrapperReleaseDir,
    "moss-installer.exe"
  );
  const bundleOutputExe = path.join(nsisBundleDir, "moss-installer.exe");

  if (!fs.existsSync(builtCargoExe)) {
    throw new Error(`Built bootstrapper binary not found: ${builtCargoExe}`);
  }

  fs.copyFileSync(builtCargoExe, targetInstallerExe);
  fs.mkdirSync(nsisBundleDir, { recursive: true });
  fs.copyFileSync(builtCargoExe, bundleOutputExe);

  console.log(`Final bootstrapper binary: ${targetInstallerExe}`);
  console.log(`Copied installer output: ${bundleOutputExe}`);
}

function main() {
  const version = validateVersions();

  console.log("1/4 Building main NSIS installer...");
  runCommand("pnpm", ["tauri", "build", "--bundles", "nsis"]);

  const generatedSetup = findGeneratedNsisSetup(version);
  fs.mkdirSync(path.dirname(embeddedSetupPath), { recursive: true });

  try {
    console.log(
      `2/4 Copying NSIS setup (${generatedSetup}) to embedded resources...`
    );
    fs.copyFileSync(generatedSetup, embeddedSetupPath);

    console.log("3/4 Building bootstrapper with embedded-setup feature...");
    runCommand("cargo", [
      "build",
      "--release",
      "--manifest-path",
      "installer/bootstrapper/src-tauri/Cargo.toml",
      "--features",
      "embedded-setup",
    ]);

    console.log("4/4 Ensuring final moss-installer.exe binary...");
    ensureFinalBinary();
  } finally {
    if (fs.existsSync(embeddedSetupPath)) {
      fs.rmSync(embeddedSetupPath, { force: true });
      console.log("Cleaned temporary embedded resource: moss-setup.exe");
    }
  }
}

main();
