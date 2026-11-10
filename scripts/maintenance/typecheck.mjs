#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tool } from './lib.mjs';
const configs = process.argv.slice(2), root = process.cwd();
if (!configs.length || configs.some((c) => path.isAbsolute(c) || c.startsWith('-') || c.split(/[\\/]/).includes('..'))) { console.error('Projetos TypeScript explícitos obrigatórios'); process.exit(1); }
const { req, dir } = tool(root, 'typescript'), ts = req('typescript');
const hasApi = typeof ts.readConfigFile === 'function' && typeof ts.parseJsonConfigFileContent === 'function' && typeof ts.sys?.readFile === 'function';
const temporary = mkdtempSync(path.join(tmpdir(), 'maintenance-tsc-'));
try {
  for (const [index, config] of configs.entries()) {
    const filename = path.resolve(root, config); let options = {};
    const prefix = hasApi ? [] : ['unshare', '--user', '--map-root-user', '--net', '--'];
    const compiler = [process.execPath, path.join(dir, 'bin/tsc'), '--noEmit', '--project', config];
    if (hasApi) {
      const parsed = ts.readConfigFile(filename, ts.sys.readFile);
      if (parsed.error) { process.exitCode = 1; break; }
      const resolved = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(filename));
      if (resolved.errors.length || !resolved.fileNames.length) { console.error(`Projeto TypeScript vazio ou inválido: ${config}`); process.exitCode = 1; break; }
      options = resolved.options || {};
    } else {
      const listed = spawnSync(prefix[0], [...prefix.slice(1), ...compiler, '--tsBuildInfoFile', path.join(temporary, `${index}.list.tsbuildinfo`), '--listFilesOnly'], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
      if (listed.error || listed.status !== 0 || !listed.stdout.split('\n').some((f) => path.isAbsolute(f.trim()) && /\.[cm]?[jt]sx?$/.test(f.trim()))) { console.error(`Projeto TypeScript vazio ou inválido na CLI: ${config}`); process.exitCode = listed.status || 1; break; }
    }
    if (!hasApi || options.incremental || options.composite) compiler.push('--tsBuildInfoFile', path.join(temporary, `${index}.tsbuildinfo`));
    const command = [...prefix, ...compiler];
    const result = spawnSync(command[0], command.slice(1), { cwd: root, env: process.env, stdio: 'inherit' });
    if (result.error || result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
