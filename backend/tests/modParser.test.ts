import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { analyzeDirectory, analyzeStagedUpload, extractZipSafely, sanitizeRelativePath } from '../src/services/modParser';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stardew-test-'));
}

describe('sanitizeRelativePath（路径穿越防护）', () => {
  test('拒绝 ../ 与绝对路径', () => {
    expect(sanitizeRelativePath('../../etc/passwd')).toBeNull();
    expect(sanitizeRelativePath('/absolute/path')).toBe('absolute/path');
    expect(sanitizeRelativePath('')).toBeNull();
  });
  test('归一化反斜杠与空段', () => {
    expect(sanitizeRelativePath('ModA\\manifest.json')).toBe('ModA/manifest.json');
    expect(sanitizeRelativePath('a/./b//c.json')).toBe('a/b/c.json');
  });
});

describe('analyzeDirectory（自动整理核心）', () => {
  test('单 Mod：解析 manifest 并推断分类', () => {
    const dir = tmp();
    const modDir = path.join(dir, 'MyMod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'manifest.json'),
      JSON.stringify({
        Name: '春季美化包',
        Author: 'Tester',
        Version: '1.2.0',
        Description: '美化春季贴图',
        UniqueID: 'Tester.SpringBeauty',
        ContentPackFor: { ID: 'Pathoschild.ContentPatcher' },
      }),
    );
    fs.writeFileSync(path.join(modDir, 'assets.png'), Buffer.alloc(10));
    const r = analyzeDirectory(dir);
    expect(r.subMods.length).toBe(1);
    expect(r.subMods[0].name).toBe('春季美化包');
    expect(r.subMods[0].uniqueId).toBe('Tester.SpringBeauty');
    expect(r.fileCount).toBe(2);
    expect(['美化贴图', 'Content Patcher']).toContain(r.suggestedCategory);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('多 Mod 合集：同一 zip 内多个 manifest 识别为合集包', () => {
    const dir = tmp();
    for (const name of ['ModA', 'ModB', 'ModC']) {
      const d = path.join(dir, name);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(
        path.join(d, 'manifest.json'),
        JSON.stringify({ Name: name, Author: 'T', Version: '1.0.0', UniqueID: `T.${name}` }),
      );
    }
    const r = analyzeDirectory(dir);
    expect(r.subMods.length).toBe(3);
    expect(r.suggestedCategory).toBe('合集包');
    expect(r.suggestedDescription).toContain('ModA');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('无 manifest：按原始文件收录，不崩', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello');
    const r = analyzeDirectory(dir);
    expect(r.subMods.length).toBe(1);
    expect(r.subMods[0].hasManifest).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('extractZipSafely / analyzeStagedUpload', () => {
  test('zip 上传自动解压并分析', () => {
    const dir = tmp();
    const zipPath = path.join(dir, 'pack.zip');
    const zip = new AdmZip();
    zip.addFile(
      'CoolMod/manifest.json',
      Buffer.from(JSON.stringify({ Name: 'CoolMod', Author: 'A', Version: '2.0.0', UniqueID: 'A.Cool' })),
    );
    zip.addFile('CoolMod/main.dll', Buffer.alloc(20));
    zip.writeZip(zipPath);

    const workRoot = path.join(dir, 'work');
    const r = analyzeStagedUpload(
      [{ absPath: zipPath, relativePath: 'pack.zip', size: fs.statSync(zipPath).size }],
      workRoot,
    );
    expect(r.fromZip).toBe(true);
    expect(r.subMods[0].name).toBe('CoolMod');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('恶意 zip 路径穿越被中和：不写到目标目录之外', () => {
    const dir = tmp();
    const zipPath = path.join(dir, 'evil.zip');
    const zip = new AdmZip();
    zip.addFile('../../evil.txt', Buffer.from('x'));
    zip.addFile('GoodMod/manifest.json', Buffer.from(JSON.stringify({ Name: 'GoodMod', UniqueID: 'T.Good' })));
    zip.writeZip(zipPath);
    const outDir = path.join(dir, 'out');
    extractZipSafely(zipPath, outDir);
    // 目标目录之外不得出现逃逸文件（恶意条目被跳过或收敛到目录内，都是安全的）
    expect(fs.existsSync(path.join(dir, 'evil.txt'))).toBe(false);
    // 合法条目仍可正常解压
    expect(fs.existsSync(path.join(outDir, 'GoodMod', 'manifest.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
