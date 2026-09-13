import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';

/**
 * Materialize a package directory as of `baseRef` into a temp folder using
 * `git show` / archive-style file reads. Falls back to copying current tree
 * when not a git repo (tests can pass explicit before/after roots instead).
 */
export async function materializePackageAtRef(
  workspaceRoot: string,
  packageRelPath: string,
  baseRef: string
): Promise<{ dir: string; cleanup: () => void; notes: string[] }> {
  const notes: string[] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bcd-base-'));
  const cleanup = () => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  const git = simpleGit(workspaceRoot);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    notes.push('Workspace is not a git repo — using current tree as baseline.');
    copyDir(path.join(workspaceRoot, packageRelPath), path.join(tmp, packageRelPath));
    return { dir: path.join(tmp, packageRelPath), cleanup, notes };
  }

  // Resolve base ref: prefer provided, else try origin/main, main, HEAD~1
  let ref = baseRef;
  const candidates = [baseRef, 'origin/main', 'main', 'master', 'HEAD~1'];
  for (const c of candidates) {
    try {
      await git.revparse([c]);
      ref = c;
      break;
    } catch {
      // try next
    }
  }
  notes.push(`Baseline ref: ${ref}`);

  // List files under package path at ref
  let files: string[] = [];
  try {
    const out = await git.raw(['ls-tree', '-r', '--name-only', ref, packageRelPath]);
    files = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    notes.push(`Could not list ${packageRelPath} at ${ref}; copying working tree.`);
    copyDir(path.join(workspaceRoot, packageRelPath), path.join(tmp, packageRelPath));
    return { dir: path.join(tmp, packageRelPath), cleanup, notes };
  }

  for (const file of files) {
    try {
      const content = await git.show([`${ref}:${file}`]);
      const dest = path.join(tmp, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, 'utf8');
    } catch {
      // skip missing
    }
  }

  const pkgDir = path.join(tmp, packageRelPath);
  if (!fs.existsSync(pkgDir)) {
    notes.push('Package path missing at baseline — using working tree copy.');
    copyDir(path.join(workspaceRoot, packageRelPath), pkgDir);
  }

  return { dir: pkgDir, cleanup, notes };
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Locate package directory by package.json name field.
 */
export function findPackageRoot(workspaceRoot: string, packageName: string): string | undefined {
  const queue = [workspaceRoot];
  while (queue.length) {
    const dir = queue.shift()!;
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === packageName) {
          return dir;
        }
      } catch {
        // ignore
      }
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) {
        continue;
      }
      if (['node_modules', '.git', 'dist', 'out', '.vscode-test'].includes(e.name)) {
        continue;
      }
      queue.push(path.join(dir, e.name));
    }
  }
  return undefined;
}
