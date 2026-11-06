const bcrypt = require('bcryptjs');
const sequelize = require('../src/config/database');
const { Admin, User, Listing } = require('../src/models');
const { ensureAdminRolesSchema } = require('./lib/adminRolesMigration');

const demoPassword = 'DemoLoakin123!';
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
const demoAdmins = [
  { email: 'admin.demo@loakinaja.local', role: 'admin' },
  { email: 'finance.demo@loakinaja.local', role: 'finance' },
  { email: 'support.demo@loakinaja.local', role: 'support' },
];

const users = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Nadia Putri',
    email: 'nadia.demo@loakinaja.local',
    phone: '+6281200000001',
    referralCode: 'LOAKNADIA1',
    referredBy: null,
    tokens: 3,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Rizky Pratama',
    email: 'rizky.demo@loakinaja.local',
    phone: '+6281200000002',
    referralCode: 'LOAKRIZKY2',
    referredBy: '10000000-0000-4000-8000-000000000001',
    tokens: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Siti Rahma',
    email: 'siti.demo@loakinaja.local',
    phone: '+6281200000003',
    referralCode: 'LOAKSITI03',
    referredBy: '10000000-0000-4000-8000-000000000001',
    tokens: 4,
  },
];

const listings = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    userId: users[0].id,
    title: 'iPhone 13 128GB Midnight',
    category: 'Handphone',
    price: 7250000,
    condition: 'Sangat Baik',
    description: 'Unit terawat, semua fungsi normal. Termasuk charger dan case.',
    location: 'Jakarta Selatan',
    status: 'active',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    userId: users[1].id,
    title: 'Kamera Fujifilm X-T30',
    category: 'Kamera',
    price: 8900000,
    condition: 'Like New',
    description: 'Shutter count rendah, kondisi terawat.',
    location: 'Bandung',
    status: 'pending',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    userId: users[2].id,
    title: 'MacBook Air M1 2020',
    category: 'Komputer',
    price: 9500000,
    condition: 'Baik',
    description: 'Termasuk charger original.',
    location: 'Yogyakarta',
    status: 'sold',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    userId: users[0].id,
    title: 'Nintendo Switch OLED',
    category: 'Elektronik',
    price: 3100000,
    condition: 'Sangat Baik',
    description: 'Kelengkapan lengkap dan siap digunakan.',
    location: 'Surabaya',
    status: 'rejected',
    reviewReason: 'Tambahkan foto kondisi barang yang lebih jelas.',
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo records when NODE_ENV=production');
  }

  await sequelize.authenticate();
  await sequelize.sync();
  await ensureAdminRolesSchema(sequelize);

  if (!adminEmail || !adminPassword || adminPassword === 'replace-with-a-strong-admin-password') {
    throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in .env before seeding');
  }

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const [, createdAdmin] = await Admin.findOrCreate({
    where: { email: adminEmail },
    defaults: { email: adminEmail, passwordHash: adminPasswordHash, role: 'super_admin' },
  });
  if (!createdAdmin) await Admin.update({ role: 'super_admin' }, { where: { email: adminEmail, role: 'admin' } });

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  let createdRoleAdmins = 0;
  for (const demoAdmin of demoAdmins) {
    const [, created] = await Admin.findOrCreate({
      where: { email: demoAdmin.email },
      defaults: { ...demoAdmin, passwordHash },
    });
    if (created) createdRoleAdmins += 1;
  }
  let createdUsers = 0;
  let createdListings = 0;

  for (const user of users) {
    const [, created] = await User.findOrCreate({
      where: { id: user.id },
      defaults: { ...user, passwordHash },
    });
    if (created) createdUsers += 1;
  }

  for (const listing of listings) {
    const [, created] = await Listing.findOrCreate({
      where: { id: listing.id },
      defaults: { ...listing, images: [] },
    });
    if (created) createdListings += 1;
  }

  console.log(`Seed complete: ${createdAdmin ? '1 super admin' : '0 super admins'}, ${createdRoleAdmins} role admins, ${createdUsers} demo users, and ${createdListings} listings created.`);
  console.log(`Admin account email: ${adminEmail}`);
  console.log('Admin password: the value configured as ADMIN_PASSWORD in .env');
  console.log(`Demo role admins (password ${demoPassword}): ${demoAdmins.map(({ email, role }) => `${email} [${role}]`).join(', ')}`);
  console.log(`Demo account password: ${demoPassword}`);
  console.log('Demo users: nadia.demo@loakinaja.local, rizky.demo@loakinaja.local, siti.demo@loakinaja.local');
}

seed()
  .catch((error) => {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
