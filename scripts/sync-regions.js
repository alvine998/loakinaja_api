const sequelize = require('../src/config/database');
const { Region } = require('../src/models');

const SOURCE = 'https://wilayah.id/api';
const CONCURRENCY = 8;

async function fetchRegions(path) {
  const response = await fetch(`${SOURCE}/${path}`);
  if (!response.ok) throw new Error(`Region source returned ${response.status} for ${path}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error(`Unexpected region response for ${path}`);
  return payload.data;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function syncRegions() {
  const provinces = await fetchRegions('provinces.json');
  const regencyGroups = await mapConcurrent(provinces, CONCURRENCY, (province) => fetchRegions(`regencies/${province.code}.json`));
  const regencies = regencyGroups.flat();
  const districtGroups = await mapConcurrent(regencies, CONCURRENCY, (regency) => fetchRegions(`districts/${regency.code}.json`));
  const districts = districtGroups.flat();

  const records = [
    ...provinces.map(({ code, name }) => ({ id: code, name, type: 'province', parentId: null })),
    ...regencies.map(({ code, name }) => ({ id: code, name, type: 'regency', parentId: code.slice(0, 2) })),
    ...districts.map(({ code, name }) => ({ id: code, name, type: 'district', parentId: code.split('.').slice(0, 2).join('.') })),
  ];

  await sequelize.transaction(async (transaction) => {
    await Region.destroy({ where: {}, transaction });
    for (let start = 0; start < records.length; start += 500) {
      await Region.bulkCreate(records.slice(start, start + 500), { transaction });
    }
  });

  console.log(`Imported ${provinces.length} provinces, ${regencies.length} regencies/cities, and ${districts.length} districts (${records.length} regions total).`);
}

async function main() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await syncRegions();
  } catch (error) {
    console.error('Failed to sync regions:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
