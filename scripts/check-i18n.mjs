import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, "src");

// Explicit allowlist for non-literal t(...) expressions per file.
// Any new dynamic t(...) call fails the check until explicitly declared here.
const KNOWN_DYNAMIC_CALLS = {
  "site-permissions.ts": {
    "`perms.${key}.title`": [
      "perms.camera.title",
      "perms.microphone.title",
      "perms.geolocation.title",
      "perms.notifications.title",
    ],
    "`perms.${key}.description`": [
      "perms.camera.description",
      "perms.microphone.description",
      "perms.geolocation.description",
      "perms.notifications.description",
    ],
  },
  "context-menu.ts": {
    "option.labelKey": [],
  },
  "main.ts": {
    "labelKey": [],
    "entry.labelKey": [],
  },
  "settings-panel.ts": {
    "labelKey": [],
    "titleKey": [],
    "key": [],
    "sections[index].labelKey": [],
  },
  "shortcuts-modal.ts": {
    "labelKey": [],
    "category.titleKey": [],
  },
  "translate-popover.ts": {
    "key": [],
    "statusKey": [],
  },
  "workspace-switcher.ts": {
    "labelKey": [],
    "key": [],
  },
};

function getPropertyKeyName(propName) {
  if (
    ts.isStringLiteral(propName) ||
    ts.isNoSubstitutionTemplateLiteral(propName)
  ) {
    return propName.text;
  }
  if (ts.isIdentifier(propName)) {
    return propName.text;
  }
  return null;
}

function getStringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function extractLocaleObjects(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const locales = { "pt-BR": new Map(), "en-US": new Map() };
  const duplicateWithinFile = [];

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      let hasPt = false;
      let hasEn = false;
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const name = getPropertyKeyName(prop.name);
        if (name === "pt-BR" && ts.isObjectLiteralExpression(prop.initializer)) {
          hasPt = true;
        }
        if (name === "en-US" && ts.isObjectLiteralExpression(prop.initializer)) {
          hasEn = true;
        }
      }

      if (hasPt || hasEn) {
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const localeName = getPropertyKeyName(prop.name);
          if (localeName !== "pt-BR" && localeName !== "en-US") continue;
          if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

          for (const entry of prop.initializer.properties) {
            if (!ts.isPropertyAssignment(entry)) continue;
            const key = getPropertyKeyName(entry.name);
            const value = getStringValue(entry.initializer);
            if (!key || value === null) continue;
            if (locales[localeName].has(key)) {
              duplicateWithinFile.push(`${localeName}:${key}`);
            }
            locales[localeName].set(key, value);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { locales, duplicateWithinFile };
}

function collectKeyArguments(argNode, sourceFile, literalKeys, dynamicCalls) {
  const literal = getStringValue(argNode);
  if (literal !== null) {
    const pos = sourceFile.getLineAndCharacterOfPosition(argNode.getStart(sourceFile));
    literalKeys.push({ key: literal, line: pos.line + 1 });
    return;
  }

  if (ts.isParenthesizedExpression(argNode)) {
    collectKeyArguments(argNode.expression, sourceFile, literalKeys, dynamicCalls);
    return;
  }

  if (ts.isConditionalExpression(argNode)) {
    collectKeyArguments(argNode.whenTrue, sourceFile, literalKeys, dynamicCalls);
    collectKeyArguments(argNode.whenFalse, sourceFile, literalKeys, dynamicCalls);
    return;
  }

  const pos = sourceFile.getLineAndCharacterOfPosition(argNode.getStart(sourceFile));
  const exprText = argNode.getText(sourceFile).trim();
  dynamicCalls.push({ exprText, line: pos.line + 1 });
}

function isTCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "t"
  );
}

function unwrapReplaceRoot(node) {
  let cur = node;
  while (
    ts.isCallExpression(cur) &&
    ts.isPropertyAccessExpression(cur.expression) &&
    cur.expression.name.text === "replace"
  ) {
    cur = cur.expression.expression;
  }
  return cur;
}

function collectUsedKeys(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const literalKeys = [];
  const dynamicCalls = [];
  const legacyReplaceLines = [];

  function visit(node) {
    if (isTCall(node) && node.arguments.length >= 1) {
      collectKeyArguments(node.arguments[0], sourceFile, literalKeys, dynamicCalls);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "replace" &&
      node.arguments.length >= 1
    ) {
      const arg0 = getStringValue(node.arguments[0]);
      if (arg0 !== null && arg0.startsWith("{")) {
        const root = unwrapReplaceRoot(node);
        if (isTCall(root)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          legacyReplaceLines.push(pos.line + 1);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { literalKeys, dynamicCalls, legacyReplaceLines };
}

function extractPlaceholders(text) {
  const matches = text.match(/\{[a-zA-Z0-9_]+\}/g) || [];
  return [...new Set(matches)].sort();
}

function main() {
  const allFiles = fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith(".ts"))
    .sort();

  const dictFiles = allFiles.filter(
    (name) => name === "i18n.ts" || name.startsWith("i18n-"),
  );

  const combined = { "pt-BR": new Map(), "en-US": new Map() };
  const errors = [];

  for (const fileName of dictFiles) {
    const fullPath = path.join(srcDir, fileName);
    const { locales, duplicateWithinFile } = extractLocaleObjects(fullPath);

    for (const dup of duplicateWithinFile) {
      errors.push(`[${fileName}] Duplicate key within file: ${dup}`);
    }

    for (const locale of ["pt-BR", "en-US"]) {
      for (const [key, value] of locales[locale].entries()) {
        if (combined[locale].has(key)) {
          errors.push(
            `[${fileName}] Key "${key}" in ${locale} already defined in another i18n file`,
          );
        }
        if (/[—–]/.test(value)) {
          errors.push(`[${fileName}] Em/en dash found in ${locale} "${key}"`);
        }
        combined[locale].set(key, value);
      }
    }
  }

  for (const key of combined["pt-BR"].keys()) {
    if (!combined["en-US"].has(key)) {
      errors.push(`Missing "en-US" translation for key "${key}"`);
    }
  }

  for (const key of combined["en-US"].keys()) {
    if (!combined["pt-BR"].has(key)) {
      errors.push(`Missing "pt-BR" translation for key "${key}"`);
    }
  }

  for (const [key, ptValue] of combined["pt-BR"].entries()) {
    const enValue = combined["en-US"].get(key);
    if (enValue === undefined) continue;
    const ptVars = extractPlaceholders(ptValue);
    const enVars = extractPlaceholders(enValue);
    if (ptVars.join(",") !== enVars.join(",")) {
      errors.push(
        `Placeholder mismatch for "${key}": pt-BR=[${ptVars.join(",")}] vs en-US=[${enVars.join(",")}]`,
      );
    }
  }

  for (const [fileName, entries] of Object.entries(KNOWN_DYNAMIC_CALLS)) {
    for (const [expr, expandedKeys] of Object.entries(entries)) {
      for (const key of expandedKeys) {
        if (!combined["pt-BR"].has(key) || !combined["en-US"].has(key)) {
          errors.push(
            `[KNOWN_DYNAMIC_CALLS ${fileName}:${expr}] Missing translation key "${key}"`,
          );
        }
      }
    }
  }

  for (const fileName of allFiles) {
    const fullPath = path.join(srcDir, fileName);
    const { literalKeys, dynamicCalls, legacyReplaceLines } = collectUsedKeys(fullPath);

    for (const line of legacyReplaceLines) {
      errors.push(
        `[${fileName}:${line}] Legacy t(...).replace("{...") pattern; pass vars as t(key, vars)`,
      );
    }

    for (const { key, line } of literalKeys) {
      if (!combined["pt-BR"].has(key) || !combined["en-US"].has(key)) {
        errors.push(
          `[${fileName}:${line}] Unknown or incomplete t("${key}") key`,
        );
      }
    }

    const fileAllowlist = KNOWN_DYNAMIC_CALLS[fileName] || {};
    for (const { exprText, line } of dynamicCalls) {
      if (!Object.prototype.hasOwnProperty.call(fileAllowlist, exprText)) {
        errors.push(
          `[${fileName}:${line}] Dynamic t(${exprText}) not declared in KNOWN_DYNAMIC_CALLS`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`i18n parity check failed (${errors.length} issue(s)):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `i18n parity OK: ${combined["pt-BR"].size} keys across ${dictFiles.join(", ")}`,
  );
}

main();
