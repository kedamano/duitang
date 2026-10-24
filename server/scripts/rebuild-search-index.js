#!/usr/bin/env node
/**
 * 全量重建帖子全文索引。
 * 索引内容或分词规则变更后执行一次即可。
 * 用法: node scripts/rebuild-search-index.js
 */
const path = require('path');

// 让 search-index 用与后端一致的数据库
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
process.env.DB_PATH = dbPath;

const { rebuildIndex } = require('../search-index');
const count = rebuildIndex(true);
console.log(`已重建 ${count} 条帖子的全文索引（${dbPath}）`);
