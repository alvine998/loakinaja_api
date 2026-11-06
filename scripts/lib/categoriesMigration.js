const DEFAULT_CATEGORIES = [
  { name: 'Handphone', slug: 'handphone', icon: 'Smartphone' },
  { name: 'Komputer', slug: 'komputer', icon: 'Monitor' },
  { name: 'Elektronik', slug: 'elektronik', icon: 'Tv' },
  { name: 'Kamera', slug: 'kamera', icon: 'Camera' },
  { name: 'Otomotif', slug: 'otomotif', icon: 'Car' },
  { name: 'Properti', slug: 'properti', icon: 'House' },
];

async function ensureCategories(sequelize) {
  const [columns] = await sequelize.query("SHOW TABLES LIKE 'categories'");
  if (!columns.length) {
    await sequelize.query('CREATE TABLE `categories` (`id` CHAR(36) NOT NULL, `name` VARCHAR(80) NOT NULL, `slug` VARCHAR(96) NOT NULL, `icon` VARCHAR(40) NOT NULL, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `categories_name_unique` (`name`), UNIQUE KEY `categories_slug_unique` (`slug`)) ENGINE=InnoDB');
  }
  const [[{ total }]] = await sequelize.query('SELECT COUNT(*) AS total FROM `categories`');
  if (Number(total) > 0) return;
  for (const category of DEFAULT_CATEGORIES) {
    await sequelize.query(
      'INSERT INTO `categories` (`id`, `name`, `slug`, `icon`, `created_at`, `updated_at`) VALUES (UUID(), ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE `icon` = IF(`icon` = "", VALUES(`icon`), `icon`)',
      { replacements: [category.name, category.slug, category.icon] },
    );
  }
}

module.exports = { ensureCategories };
