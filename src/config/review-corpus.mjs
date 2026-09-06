export const REVIEW_POSTS = [
  "browser-extension-permission-audit-2026",
  "home-nas-ransomware-backup-isolation-checklist-2026",
  "home-printer-wifi-privacy-reset-before-selling-2026",
  "home-router-dns-filtering-family-security-plan-2026",
  "oauth-consent-phishing-app-access-audit",
  "old-smartphone-authenticator-migration-before-trade-in-2026",
  "lost-stolen-laptop-account-data-response-plan",
  "router-security-audit-checklist-2026",
];

export const REVIEW_POST_SET = new Set(REVIEW_POSTS);
export const REVIEW_MIN_EQUIVALENT_WORDS = 1500;
export const REVIEW_MIN_SOURCES = 8;
export const REVIEW_MIN_IMAGES = 5;

// These category archives remain noindex because the final corpus gives them
// fewer than three articles. The sitemap filter uses the same explicit set.
export const REVIEW_NOINDEX_CATEGORY_PATHS = [
  "/category/account-security/",
  "/category/browser-security/",
  "/category/home-cybersecurity/",
  "/category/home-network-security/",
  "/category/identity-security/",
  "/category/network-security/",
  "/category/personal-security/",
];
export const REVIEW_NOINDEX_CATEGORY_PATH_SET = new Set(REVIEW_NOINDEX_CATEGORY_PATHS);
