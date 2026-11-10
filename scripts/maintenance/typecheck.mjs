#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tool } from './lib.mjs';
const configs = process.argv.slice(2), root = process.cwd();
if (!configs.length || configs.some((c) => path.isAbsolute(c) || c.startsWith('-') || c.split(/[\\/]/).includes('..'))) { console.error('Projetos TypeScript explícitos obrigatórios'); process.exit(1); }
const { req, dir } = tool(root, 'typescript'), ts = req('typescript');
const temporary = mkdtempSync(path.join(tmpdir(), 'maintenance-tsc-'));
try {
  for (const [index, config] of configs.entries()) {
    const filename = path.resolve(root, config), parsed = ts.readConfigFile(filename, ts.sys.readFile);
    if (parsed.error) { process.exitCode = 1; break; }
    const resolved = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(filename));
    if (resolved.errors.length || !resolved.fileNames.length) { console.error(`Projeto TypeScript vazio ou inválido: ${config}`); process.exitCode = 1; break; }
    const command = [path.join(dir, 'bin/tsc'), '--noEmit', '--project', config];
    if (resolved.options?.incremental || resolved.options?.composite) command.push('--tsBuildInfoFile', path.join(temporary, `${index}.tsbuildinfo`));
    const result = spawnSync(process.execPath, command, { cwd: root, env: process.env, stdio: 'inherit' });
    if (result.error || result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
