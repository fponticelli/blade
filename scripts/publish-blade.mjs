#!/usr/bin/env node

/**
 * Interactive NPM publish script for @bladets/template
 * Prompts for version, runs checks, and publishes.
 *
 * Usage: node scripts/publish-blade.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bladeDir = join(__dirname, '..', 'packages', 'blade');
const packagePath = join(bladeDir, 'package.json');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function exec(cmd, options = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: bladeDir, ...options });
    return true;
  } catch {
    return false;
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(packagePath, 'utf-8'));
}

function writePackageJson(pkg) {
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

function incrementVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

async function main() {
  console.log('\n🔪 @bladets/template - Interactive Publish\n');

  const pkg = readPackageJson();
  const currentVersion = pkg.version;

  console.log(`Current version: ${currentVersion}`);
  console.log('\nVersion options:');
  console.log(`  1) patch  → ${incrementVersion(currentVersion, 'patch')}`);
  console.log(`  2) minor  → ${incrementVersion(currentVersion, 'minor')}`);
  console.log(`  3) major  → ${incrementVersion(currentVersion, 'major')}`);
  console.log(`  4) custom → enter manually`);
  console.log(`  5) keep   → ${currentVersion} (no change)`);

  const choice = await question('\nSelect version [1-5]: ');

  let newVersion;
  switch (choice.trim()) {
    case '1':
      newVersion = incrementVersion(currentVersion, 'patch');
      break;
    case '2':
      newVersion = incrementVersion(currentVersion, 'minor');
      break;
    case '3':
      newVersion = incrementVersion(currentVersion, 'major');
      break;
    case '4':
      newVersion = await question('Enter version: ');
      break;
    case '5':
      newVersion = currentVersion;
      break;
    default:
      console.log('Invalid choice. Exiting.');
      rl.close();
      process.exit(1);
  }

  // Validate semver
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(newVersion)) {
    console.log(`Invalid version format: ${newVersion}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\nWill publish version: ${newVersion}`);

  // Update package.json if version changed
  if (newVersion !== currentVersion) {
    pkg.version = newVersion;
    writePackageJson(pkg);
    console.log(`✓ Updated package.json to ${newVersion}`);
  }

  // Confirm
  const confirm = await question('\nRun checks and publish? [y/N]: ');
  if (confirm.toLowerCase() !== 'y') {
    // Revert version if changed
    if (newVersion !== currentVersion) {
      pkg.version = currentVersion;
      writePackageJson(pkg);
      console.log('Reverted version change.');
    }
    console.log('Aborted.');
    rl.close();
    process.exit(0);
  }

  // Run checks
  console.log('\n📋 Running checks...\n');
  if (!exec('npm run check')) {
    console.log('\n❌ Checks failed. Fix issues and try again.');
    // Revert version
    if (newVersion !== currentVersion) {
      pkg.version = currentVersion;
      writePackageJson(pkg);
      console.log('Reverted version change.');
    }
    rl.close();
    process.exit(1);
  }

  // Show what will be published
  console.log('\n📦 Package contents:\n');
  exec('npm pack --dry-run');

  const finalConfirm = await question('\nPublish to NPM? [y/N]: ');
  if (finalConfirm.toLowerCase() !== 'y') {
    if (newVersion !== currentVersion) {
      pkg.version = currentVersion;
      writePackageJson(pkg);
      console.log('Reverted version change.');
    }
    console.log('Aborted.');
    rl.close();
    process.exit(0);
  }

  // Publish
  console.log('\n🚀 Publishing...\n');
  if (exec('npm publish --access public')) {
    console.log(`\n✅ Successfully published @bladets/template@${newVersion}`);
    console.log(`\nView at: https://www.npmjs.com/package/@bladets/template`);
  } else {
    console.log('\n❌ Publish failed.');
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
