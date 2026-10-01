// Metro configuration for CafeOS.
//
// The project lives inside a OneDrive-synced folder. OneDrive's background
// hydration/metadata churn can crash Metro's file watcher during dependency
// installs. If Metro still crashes with "TreeFS: Failed to make parent
// directory entry", stop OneDrive sync for this folder or move the project
// outside OneDrive.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep folders the app never imports out of Metro's file crawl: the backend
// (including its own node_modules), the exported web build in dist/, caches
// and git metadata. The crawl runs on every cold start and is the single
// slowest step when the project sits inside a OneDrive-synced folder.
const ignoredRoots = ['backend', 'dist', '.expo', '.git'];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredPattern = new RegExp(
  `^(${ignoredRoots.map((dir) => escapeRegExp(path.join(__dirname, dir))).join('|')})([\\\\/]|$)`
);

config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, ignoredPattern)
  : ignoredPattern;

module.exports = config;
