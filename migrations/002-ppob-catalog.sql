-- Persist Digiflazz price-list snapshots so catalog reads do not call the provider.
CREATE TABLE ppob_catalogs (
  type ENUM('prepaid', 'postpaid') NOT NULL PRIMARY KEY,
  products JSON NOT NULL,
  fetched_at DATETIME NOT NULL,
  last_attempt_at DATETIME NULL
);
