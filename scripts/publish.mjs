#!/usr/bin/env node
/**
 * Interactive publish script for blade packages
 *
 * Usage: node scripts/publish.mjs
 *
 * This script will:
 * 1. Prompt you to select which package to publish
 * 2. Prompt you to select the version bump (patch, minor, major)
 * 3. Run checks, bump version, and publish to npm
 */

import { execSync } from 'child_process';
import * as readline from 'readline';

const PACKAGES = [
  { name: '@bladets/template', dir: 'packages/blade' },
  { name: '@bladets/tempo', dir: 'packages/blade-tempo' },
  { name: 'blade-vscode', dir: 'packages/blade-vscode', isVSCode: true },
];

const VERSION_TYPES = ['patch', 'minor', 'major'];

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function exec(cmd, options = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    return false;
  }
}

function getCurrentVersion(dir) {
  const pkg = JSON.parse(execSync(`cat ${dir}/package.json`, { encoding: 'utf-8' }));
  return pkg.version;
}

async function selectPackage() {
  console.log('\n📦 Select package to publish:\n');
  PACKAGES.forEach((pkg, i) => {
    const version = getCurrentVersion(pkg.dir);
    console.log(`  ${i + 1}) ${pkg.name} (v${version})`);
  });
  console.log(`  0) Cancel\n`);

  const answer = await prompt('Enter number: ');
  const index = parseInt(answer, 10) - 1;

  if (answer === '0' || isNaN(index) || index < 0 || index >= PACKAGES.length) {
    return null;
  }

  return PACKAGES[index];
}

async function selectVersionType() {
  console.log('\n📈 Select version bump:\n');
  VERSION_TYPES.forEach((type, i) => {
    console.log(`  ${i + 1}) ${type}`);
  });
  console.log(`  0) Cancel\n`);

  const answer = await prompt('Enter number: ');
  const index = parseInt(answer, 10) - 1;

  if (answer === '0' || isNaN(index) || index < 0 || index >= VERSION_TYPES.length) {
    return null;
  }

  return VERSION_TYPES[index];
}

async function publishNpmPackage(pkg, versionType) {
  const currentVersion = getCurrentVersion(pkg.dir);
  console.log(`\n🚀 Publishing ${pkg.name}`);
  console.log(`   Current version: ${currentVersion}`);
  console.log(`   Bump type: ${versionType}\n`);

  const confirm = await prompt('Proceed? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return false;
  }

  // Run checks first
  console.log('\n🔍 Running checks...');
  if (!exec(`cd ${pkg.dir} && npm run check`)) {
    console.error('❌ Checks failed. Fix errors before publishing.');
    return false;
  }

  // Bump version
  console.log(`\n📝 Bumping version (${versionType})...`);
  if (!exec(`cd ${pkg.dir} && npm version ${versionType}`)) {
    return false;
  }

  // Publish
  console.log('\n📤 Publishing to npm...');
  if (!exec(`cd ${pkg.dir} && npm publish --access public`)) {
    return false;
  }

  const newVersion = getCurrentVersion(pkg.dir);
  console.log(`\n✅ Successfully published ${pkg.name}@${newVersion}`);

  // Remind to push git tags
  console.log('\n💡 Remember to push git tags:');
  console.log('   git push && git push --tags\n');

  return true;
}

async function publishVSCodeExtension(pkg, versionType) {
  const currentVersion = getCurrentVersion(pkg.dir);
  console.log(`\n🚀 Publishing ${pkg.name} VSCode Extension`);
  console.log(`   Current version: ${currentVersion}`);
  console.log(`   Bump type: ${versionType}\n`);

  const confirm = await prompt('Proceed? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return false;
  }

  // Bump version manually (VSCode extensions don't use npm version)
  console.log(`\n📝 Bumping version (${versionType})...`);
  if (!exec(`cd ${pkg.dir} && npm version ${versionType} --no-git-tag-version`)) {
    return false;
  }

  // Build for production
  console.log('\n🔨 Building for production...');
  if (!exec(`cd ${pkg.dir} && npm run vscode:prepublish`)) {
    return false;
  }

  // Package
  console.log('\n📦 Packaging extension...');
  if (!exec(`cd ${pkg.dir} && npx vsce package --no-dependencies`)) {
    return false;
  }

  // Publish
  console.log('\n📤 Publishing to VS Code Marketplace...');
  if (!exec(`cd ${pkg.dir} && npx vsce publish`)) {
    console.log('\n⚠️  If publish failed, make sure you have a valid Personal Access Token.');
    console.log('   Run: npx vsce login <publisher>');
    return false;
  }

  const newVersion = getCurrentVersion(pkg.dir);
  console.log(`\n✅ Successfully published ${pkg.name}@${newVersion}`);

  // Remind to commit and push
  console.log('\n💡 Remember to commit version bump and push:');
  console.log('   git add . && git commit -m "Bump blade-vscode to ' + newVersion + '" && git push\n');

  return true;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       Blade Package Publisher          ║');
  console.log('╚════════════════════════════════════════╝');

  const pkg = await selectPackage();
  if (!pkg) {
    console.log('Cancelled.');
    process.exit(0);
  }

  const versionType = await selectVersionType();
  if (!versionType) {
    console.log('Cancelled.');
    process.exit(0);
  }

  let success;
  if (pkg.isVSCode) {
    success = await publishVSCodeExtension(pkg, versionType);
  } else {
    success = await publishNpmPackage(pkg, versionType);
  }

  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
