const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function git(...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const status = git('status', '--porcelain=v1', '--untracked-files=all')
  .split('\n')
  .filter(Boolean);
const untracked = status.filter((line) => line.startsWith('?? '));
const ignored = git('status', '--porcelain=v1', '--ignored')
  .split('\n')
  .filter(Boolean)
  .filter((line) => line.startsWith('!! '))
  .map((line) => line.slice(3));

const tracked = git('ls-files', '-z')
  .split('\0')
  .filter(Boolean);

const forbidden = [
  /^\.env(?:\.|$)/,
  /^\.secrets(?:\/|$)/,
  /^backups(?:\/|$)/,
  /^(?:dist|generated|node_modules)(?:\/|$)/,
  /^(?:qa|\.playwright-mcp)(?:\/|$)/,
  /(?:^|\/)(?:Foto|Фото|R|R-test|R-test-out|R-padded|R-final|staging-flat|staging-named)(?:\/|$)/,
  /\.(?:csv|zip|log)$/i,
  /^reports\/.*\.xlsx$/i,
];

const forbiddenTracked = tracked.filter((file) => {
  if (file === '.env.example' || file === 'public/template.xlsx') return false;
  return forbidden.some((pattern) => pattern.test(file));
});

const localResidue = ignored.filter((file) =>
  /^(?:qa|\.playwright-mcp|Foto|Фото|R|R-test|R-test-out|R-padded|R-final|staging-flat|staging-named)(?:\/|$)/.test(file) ||
  /^reports\/.*\.(?:csv|zip|log|xlsx)$/i.test(file) ||
  /(?:^|\/)(?:debug\.log|[^/]+-modal\.png)$/i.test(file),
);

const errors = [];
if (untracked.length > 0) {
  errors.push(
    `Найдены неигнорируемые неотслеживаемые файлы:\n${untracked
      .map((line) => `  ${line.slice(3)}`)
      .join('\n')}`,
  );
}
if (forbiddenTracked.length > 0) {
  errors.push(
    `Запрещённые артефакты отслеживаются Git:\n${forbiddenTracked
      .map((file) => `  ${file}`)
      .join('\n')}`,
  );
}
if (localResidue.length > 0) {
  errors.push(
    `В рабочем дереве остались локальные артефакты:\n${localResidue
      .map((file) => `  ${file}`)
      .join('\n')}`,
  );
}

if (errors.length > 0) {
  console.error('check-repo-hygiene: FAIL');
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`check-repo-hygiene: ok (${tracked.length} tracked files)`);
