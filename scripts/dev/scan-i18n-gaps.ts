import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(process.cwd(), 'src');
const I18N_DIR = path.join(process.cwd(), 'src', 'i18n');
const LOCALES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar'];

function flatten(obj: any, out = new Set<string>()): Set<string> {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, out);
    else if (typeof v === 'string') out.add(v);
  }
  return out;
}

const i18nValues = new Set<string>();
for (const loc of LOCALES) {
  const p = path.join(I18N_DIR, `${loc}.json`);
  if (fs.existsSync(p)) flatten(JSON.parse(fs.readFileSync(p, 'utf8')), i18nValues);
}

const excludeDirPatterns = [ /prototype/, /grow/, /test/, /__tests__/, /node_modules/ ];
const excludeFilePathPatterns = [ /\/api\//, /\/server\//, /\/core\//, /\/lib\//, /\/actions\//, /\/middleware/ ];

function shouldScan(p: string) {
  if (!p.endsWith('.tsx')) return false;
  for (const re of excludeDirPatterns) if (re.test(p)) return false;
  for (const re of excludeFilePathPatterns) if (re.test(p)) return false;
  return true;
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (shouldScan(full)) yield full;
  }
}

interface Finding { file: string; line: number; text: string; context: string; inI18n: boolean; }

function getContextChain(node: ts.Node): string {
  const parts: string[] = [];
  let n: ts.Node | undefined = node;
  while (n && parts.length < 8) {
    let label = ts.SyntaxKind[n.kind];
    if (ts.isJsxAttribute(n) && n.name) label = `JsxAttribute:${n.name.getText()}`;
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name)) label = `Prop:${n.name.text}`;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) label = `Call:${n.expression.text}`;
    parts.push(label);
    n = n.parent;
    if (n === node) break;
  }
  return parts.join(' > ');
}

function isArgumentToTranslation(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent && ts.isCallExpression(parent)) {
    if (ts.isIdentifier(parent.expression)) {
      const name = parent.expression.text;
      if (name === 't' || name.startsWith('t') && /^t[A-Z]/.test(name)) return true;
    }
  }
  return false;
}

function isImportOrUseDirective(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent && ts.isImportDeclaration(parent)) return true;
  if (parent && ts.isExpressionStatement(parent) && node.getText() === '"use client"') return true;
  return false;
}

function isPropertyName(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (parent && ts.isBindingElement(parent) && parent.propertyName === node) return true;
  return false;
}

const uiAttrs = new Set(['placeholder', 'aria-label', 'title', 'alt', 'label', 'helperText', 'description', 'confirmText', 'cancelText', 'submitText', 'buttonText', 'emptyText', 'errorText', 'tooltip', 'summary', 'aria-placeholder']);

function isJsxTextOrUiStringLiteral(node: ts.Node, ctx: string): boolean {
  const parent = node.parent;

  // JSX text nodes are always UI text
  if (ts.isJsxText(node)) return true;

  // String literal as JSX child: e.g. <button>OK</button> or <>{'text'}</>
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (parent && (ts.isJsxElement(parent) || ts.isJsxFragment(parent) || ts.isJsxSelfClosingElement(parent))) return true;
    if (parent && ts.isJsxExpression(parent)) {
      const grand = parent.parent;
      if (grand && (ts.isJsxElement(grand) || ts.isJsxFragment(grand))) return true;
    }
    // JSX attribute for a known UI attribute
    if (parent && ts.isJsxAttribute(parent) && parent.name) {
      const attrName = parent.name.getText();
      if (uiAttrs.has(attrName)) return true;
    }
  }
  return false;
}

function isLikelyUiText(node: ts.Node, ctx: string): boolean {
  const s = ts.isJsxText(node) ? node.getText() : (node as ts.StringLiteral).text;
  if (!s || s.length < 2) return false;
  if (s === 'use client' || s === 'use server') return false;
  if (/^\s+$/.test(s)) return false;

  // Skip non-UI JSX attributes
  const parent = node.parent;
  if (parent && ts.isJsxAttribute(parent) && parent.name) {
    const attrName = parent.name.getText();
    const nonTextAttrs = new Set(['className', 'class', 'id', 'name', 'src', 'href', 'to', 'path', 'd', 'viewBox', 'xmlns', 'fill', 'stroke', 'width', 'height', 'fillRule', 'clipRule', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'clipPath', 'mask', 'display', 'flexDirection', 'justifyContent', 'alignItems']);
    if (nonTextAttrs.has(attrName)) return false;
  }

  // Skip CSS strings in style objects
  if (parent && ts.isPropertyAssignment(parent)) {
    const propName = parent.name.getText();
    if (propName === 'style' || ['padding', 'margin', 'color', 'background', 'border', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'borderRadius', 'boxShadow', 'textAlign', 'display', 'justifyContent', 'alignItems', 'gap', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'position', 'top', 'left', 'right', 'bottom', 'overflow', 'cursor', 'opacity', 'zIndex', 'transition', 'transform'].includes(propName)) return false;
    if (s.startsWith('var(') || /^\d+(\.\d+)?(px|rem|em|%|vh|vw|s|ms)$/.test(s) || s.startsWith('rgba(') || /^#[0-9a-fA-F]{3,8}$/.test(s)) return false;
  }

  // Skip translations keys passed to t()
  if (isArgumentToTranslation(node)) return false;

  // Skip import paths / file names
  if (isImportOrUseDirective(node)) return false;

  // Skip property names
  if (isPropertyName(node)) return false;

  // Keep JSX text and UI strings
  if (isJsxTextOrUiStringLiteral(node, ctx)) return true;

  // Skip all other string literals (variables, args, etc.)
  return false;
}

const findings: Finding[] = [];

for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = ts.isJsxText(node) ? node.getText() : (node as ts.StringLiteral).text;
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const ctx = getContextChain(node);
      if (isLikelyUiText(node, ctx)) {
        findings.push({ file: path.relative(process.cwd(), file), line: line + 1, text: text.trim(), context: ctx, inI18n: i18nValues.has(text.trim()) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const byFile = new Map<string, Finding[]>();
for (const f of findings) {
  const list = byFile.get(f.file) || [];
  list.push(f);
  byFile.set(f.file, list);
}

let total = 0;
for (const file of Array.from(byFile.keys()).sort()) {
  const list = byFile.get(file)!;
  console.log(`\n=== ${file} ===`);
  for (const f of list) {
    const i18nMark = f.inI18n ? ' [in i18n]' : '';
    console.log(`  L${f.line} ${JSON.stringify(f.text)}${i18nMark}`);
  }
  total += list.length;
}
console.log(`\nTotal UI candidate strings: ${total}`);
