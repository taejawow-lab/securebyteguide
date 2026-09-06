import fs from 'node:fs';
import path from 'node:path';
import {
  REVIEW_POSTS,
  REVIEW_POST_SET,
  REVIEW_MIN_EQUIVALENT_WORDS,
  REVIEW_MIN_SOURCES,
  REVIEW_MIN_IMAGES,
  REVIEW_NOINDEX_CATEGORY_PATHS,
} from '../src/config/review-corpus.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src/content/posts');
const imageRoot = path.join(root, 'public');
const failures = [];
const rows = [];
const longParagraphOwners = new Map();
const allPostFiles = fs.readdirSync(postsDir).filter((name) => name.endsWith('.mdx')).sort();
const distMode = process.argv.includes('--dist');

const sourceExtensions = new Set(['.astro', '.ts', '.js', '.mjs', '.mdx']);
function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walkFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const file of walkFiles(path.join(root, 'src'))) {
  if (!sourceExtensions.has(path.extname(file))) continue;
  const text = fs.readFileSync(file, 'utf8');
  const frontmatterBlock = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  if (file.endsWith('.mdx') && /^draft:\s*true\s*$/m.test(frontmatterBlock)) continue;
  if (/[\u3131-\u318E\uAC00-\uD7A3]/u.test(text)) failures.push(`${path.relative(root, file)}: Korean remains in public English source`);
}

function parsePost(file) {
  const slug = file.replace(/\.mdx$/, '');
  const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) throw new Error(`frontmatter missing: ${file}`);
  const fm = match[1];
  const body = raw.slice(match[0].length);
  const draft = /^draft:\s*true\s*$/m.test(fm);
  const category = (fm.match(/^category:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1] || '').trim();
  const visualsCount = Number(fm.match(/^visualsCount:\s*(\d+)\s*$/m)?.[1] || 0);
  const sourceBlock = fm.match(/^sources:\s*\r?\n([\s\S]*?)(?=^[A-Za-z][A-Za-z0-9_]*:\s|\Z)/m)?.[1] || '';
  const sources = [...new Set([...sourceBlock.matchAll(/\burl:\s*["']?(https?:\/\/[^\s"']+)/g)].map((m) => m[1].replace(/["']$/, '')))];
  const hero = fm.match(/^heroImage:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
  const bodyImages = [...body.matchAll(/(?:src=["']|!\[[^\]]*\]\()(?<src>\/images\/[^\s)"']+\.(?:png|jpe?g|webp|gif))/gi)].map((m) => m.groups.src);
  const images = [...new Set([hero, ...bodyImages].filter(Boolean))];
  const internalTargets = [...new Set([...raw.matchAll(/(?:https?:\/\/securebyteguide\.org)?\/posts\/([a-z0-9-]+)\/?/gi)].map((m) => m[1]))];
  return { slug, raw, fm, body, draft, category, visualsCount, sources, images, internalTargets };
}

function visibleBody(body) {
  return body
    .replace(/^import\s+.*$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[|#>*_`{}[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return (text.match(/\b[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*\b/g) || []).length;
}

function normalizeParagraph(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/\[[^\]]+\]\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const parsed = allPostFiles.map(parsePost);
const parsedBySlug = new Map(parsed.map((post) => [post.slug, post]));
const publicPosts = parsed.filter((post) => !post.draft);
const actualPublic = publicPosts.map((post) => post.slug).sort();
const expectedPublic = [...REVIEW_POSTS].sort();
if (JSON.stringify(actualPublic) !== JSON.stringify(expectedPublic)) failures.push('public slug set differs from REVIEW_POSTS');
if (publicPosts.length < 8) failures.push(`expected at least 8 public posts; found ${publicPosts.length}`);
for (const post of parsed) {
  if (REVIEW_POST_SET.has(post.slug) && post.draft) failures.push(`${post.slug}: retained post is drafted`);
  if (!REVIEW_POST_SET.has(post.slug) && !post.draft) failures.push(`${post.slug}: non-retained post is public`);
}

const bannedBodyPatterns = [
  [/adsense[- ]read(?:y|iness)/i, 'AdSense-readiness production wording'],
  [/publishing (?:run|workflow)/i, 'publishing-process wording'],
  [/(?:generated|newly generated) raster/i, 'generated-raster wording'],
  [/image[- ]qa/i, 'image-QA wording'],
  [/search engines can verify/i, 'search-engine production wording'],
  [/household, workplace, account, pet, or cash-flow routine/i, 'cross-domain template boilerplate'],
  [/policies, product menus, clinic workflows, and platform settings change/i, 'cross-domain policy boilerplate'],
];
const unsupportedExperience = /\b(?:we|our (?:team|editors?))\s+(?:tested|reviewed|verified|used|tried)\b/i;
const badImageName = /(?:contact[-_ ]?sheet|placeholder|sample|dummy|stock)/i;

for (const post of publicPosts) {
  const visible = visibleBody(post.body);
  const headingSeen = new Set();
  for (const headingMatch of post.body.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)) {
    const heading = headingMatch[1].trim().toLowerCase();
    if (headingSeen.has(heading)) failures.push(`${post.slug}: duplicate heading: ${heading}`);
    headingSeen.add(heading);
  }
  for (const [lineIndex, line] of post.body.split(/\r?\n/).entries()) {
    const sentenceSeen = new Set();
    for (const rawSentence of line.matchAll(/[^.!?]+(?:[.!?]+|$)/g)) {
      const sentence = rawSentence[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (wordCount(sentence) < 18) continue;
      if (sentenceSeen.has(sentence)) failures.push(`${post.slug}: repeated long sentence on line ${lineIndex + 1}`);
      sentenceSeen.add(sentence);
    }
  }


  const words = wordCount(visible);
  rows.push({ slug: post.slug, words, sources: post.sources.length, images: post.images.length, category: post.category });
  if (words < REVIEW_MIN_EQUIVALENT_WORDS) failures.push(`${post.slug}: ${words} body words < ${REVIEW_MIN_EQUIVALENT_WORDS}`);
  if (post.sources.length < REVIEW_MIN_SOURCES) failures.push(`${post.slug}: ${post.sources.length} unique sources < ${REVIEW_MIN_SOURCES}`);
  if (post.images.length < REVIEW_MIN_IMAGES) failures.push(`${post.slug}: ${post.images.length} unique local rasters < ${REVIEW_MIN_IMAGES}`);
  if (post.visualsCount !== post.images.length) failures.push(`${post.slug}: visualsCount ${post.visualsCount} != rendered unique rasters ${post.images.length}`);
  for (const image of post.images) {
    if (!image.startsWith('/images/illustrations/')) failures.push(`${post.slug}: non-editorial image path ${image}`);
    if (!/\.(?:png|jpe?g|webp)$/i.test(image)) failures.push(`${post.slug}: non-raster image ${image}`);
    if (badImageName.test(path.basename(image))) failures.push(`${post.slug}: rejected image filename ${image}`);
    if (!fs.existsSync(path.join(imageRoot, image.replace(/^\//, '')))) failures.push(`${post.slug}: missing image ${image}`);
  }
  for (const [pattern, label] of bannedBodyPatterns) if (pattern.test(visible)) failures.push(`${post.slug}: ${label}`);
  if (unsupportedExperience.test(visible)) failures.push(`${post.slug}: unsupported first-person experience claim`);
  for (const target of post.internalTargets) if (target !== post.slug && !REVIEW_POST_SET.has(target)) failures.push(`${post.slug}: internal post target is not public: ${target}`);
  const paragraphs = post.body.split(/\r?\n\s*\r?\n/).map(normalizeParagraph).filter((p) => wordCount(p) >= 18);
  const seenHere = new Set();
  for (const paragraph of paragraphs) {
    if (seenHere.has(paragraph)) failures.push(`${post.slug}: repeated 18+ word paragraph within article`);
    seenHere.add(paragraph);
    const prior = longParagraphOwners.get(paragraph);
    if (prior && prior !== post.slug) failures.push(`${post.slug}: repeated 18+ word paragraph also in ${prior}`);
    else longParagraphOwners.set(paragraph, post.slug);
  }
}

// Known unsupported experience claims must never be reader-visible. Drafts are excluded by the exact public-corpus gate above.
for (const slug of ['dark-web-monitoring-services', 'home-router-security-settings', 'vpn-leak-tests-prevention', 'vpn-multi-hop-paranoia-options']) {
  const post = parsedBySlug.get(slug);
  if (!post.draft && unsupportedExperience.test(visibleBody(post.body))) failures.push(`${slug}: known unsupported experience claim remains`);
}

// Category noindex behavior is preserved and its exact final paths feed the sitemap exclusion.
const categoryCounts = new Map();
for (const post of publicPosts) categoryCounts.set(post.category, (categoryCounts.get(post.category) || 0) + 1);
const slugify = (value) => value.toLowerCase().trim().replace(/\s+/g, '-');
const expectedNoindexCategories = [...categoryCounts].filter(([, count]) => count < 3).map(([category]) => `/category/${slugify(category)}/`).sort();
const configuredNoindexCategories = [...REVIEW_NOINDEX_CATEGORY_PATHS].sort();
if (JSON.stringify(expectedNoindexCategories) !== JSON.stringify(configuredNoindexCategories)) failures.push(`noindex category sitemap set mismatch: expected ${expectedNoindexCategories.join(', ')}`);

const trustFiles = ['src/components/Hero.astro', 'src/pages/about.astro', 'src/pages/editorial-process.astro', 'src/pages/editorial-standards.astro', 'src/pages/privacy.astro', 'src/pages/terms.astro', 'src/pages/disclaimer.astro', 'src/pages/affiliate-disclosure.astro', 'src/pages/contact.astro', 'src/pages/cookie-policy.astro'];
const trustBans = [
  /every recommendation/i,
  /all data (?:is|are) verified/i,
  /every source is linked/i,
  /all primary sources are verified/i,
  /AI detector threshold/i,
  /auto-generated visuals/i,
  /automatic updates/i,
  /preserved guides/i,
];
for (const file of trustFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const pattern of trustBans) if (pattern.test(text)) failures.push(`${file}: unsupported universal/process claim ${pattern}`);
  if (/[\u3131-\u318E\uAC00-\uD7A3]/u.test(text)) failures.push(`${file}: Korean characters remain on English trust route`);
  if (/\bnoindex\s*=|noindex:\s*true/i.test(text)) failures.push(`${file}: trust route is marked noindex`);
}

const adsText = fs.readFileSync(path.join(root, 'public/ads.txt'), 'utf8');
if (/pub-XXXXXXXX|Until then|replace the line below/i.test(adsText)) failures.push('public/ads.txt: stale placeholder or pre-approval instruction');
const heroText = fs.readFileSync(path.join(root, 'src/components/Hero.astro'), 'utf8');
for (const pattern of [/Live tool/i, />72</, /Password manager in use/, /Email protected with MFA/, /Automatic device backups/, /7 min read/]) {
  if (pattern.test(heroText)) failures.push(`src/components/Hero.astro: fabricated pre-check security result ${pattern}`);
}

if (distMode) {
  const dist = path.join(root, 'dist');
  for (const file of walkFiles(dist).filter((name) => name.endsWith('.html'))) {
    if (/[\u3131-\u318E\uAC00-\uD7A3]/u.test(fs.readFileSync(file, 'utf8'))) failures.push(`dist rendered page contains Korean: ${path.relative(dist, file)}`);
  }
  const sitemapFiles = fs.readdirSync(dist).filter((name) => /^sitemap-\d+\.xml$/.test(name));
  const urls = sitemapFiles.flatMap((name) => [...fs.readFileSync(path.join(dist, name), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  if (!urls.length) failures.push('dist sitemap has no page URLs');
  const wrongDomain = urls.filter((url) => !url.startsWith('https://securebyteguide.org/'));
  if (wrongDomain.length) failures.push(`dist sitemap wrong-domain URLs: ${wrongDomain.join(', ')}`);
  const sitemapPaths = new Set(urls.map((url) => new URL(url).pathname));
  for (const slug of REVIEW_POSTS) if (!sitemapPaths.has(`/posts/${slug}/`)) failures.push(`dist sitemap missing retained post: ${slug}`);
  for (const post of parsed.filter((item) => item.draft)) if (sitemapPaths.has(`/posts/${post.slug}/`)) failures.push(`dist sitemap includes draft: ${post.slug}`);
  for (const pathname of sitemapPaths) {
    const target = pathname === '/' ? path.join(dist, 'index.html') : path.join(dist, pathname.replace(/^\//, ''), 'index.html');
    if (fs.existsSync(target) && /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(fs.readFileSync(target, 'utf8'))) failures.push(`dist sitemap includes noindex URL: ${pathname}`);
  }
  for (const route of ['/about/', '/editorial-process/', '/editorial-standards/', '/privacy/', '/terms/', '/disclaimer/', '/affiliate-disclosure/', '/contact/', '/cookie-policy/']) {
    const target = path.join(dist, route.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(target)) failures.push(`dist trust route missing: ${route}`);
    else {
      const html = fs.readFileSync(target, 'utf8');
      if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) failures.push(`dist trust route is noindex: ${route}`);
      if (/[\u3131-\u318E\uAC00-\uD7A3]/u.test(html)) failures.push(`dist trust route contains Korean: ${route}`);
    }
  }
  for (const htmlFile of fs.readdirSync(path.join(dist, 'posts'), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const source = path.join(dist, 'posts', htmlFile.name, 'index.html');
    if (!fs.existsSync(source)) continue;
    const html = fs.readFileSync(source, 'utf8');
    for (const match of html.matchAll(/href=["']\/posts\/([a-z0-9-]+)\/?["']/gi)) {
      const target = path.join(dist, 'posts', match[1], 'index.html');
      if (!fs.existsSync(target)) failures.push(`dist broken internal post link: ${htmlFile.name} -> ${match[1]}`);
    }
  }
}

rows.sort((a, b) => a.slug.localeCompare(b.slug));
const result = {
  status: failures.length ? 'FAIL' : 'PASS',
  publicCount: publicPosts.length,
  minWords: Math.min(...rows.map((row) => row.words)),
  maxWords: Math.max(...rows.map((row) => row.words)),
  minSources: Math.min(...rows.map((row) => row.sources)),
  minImages: Math.min(...rows.map((row) => row.images)),
  noindexCategoryPaths: expectedNoindexCategories,
  distChecked: distMode,
  failures,
  rows,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
