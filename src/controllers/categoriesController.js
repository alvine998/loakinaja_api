const { Op } = require('sequelize');
const { Category, Listing } = require('../models');

const ALLOWED_ICONS = new Set([
  'Smartphone', 'Monitor', 'Tv', 'Camera', 'Car', 'House', 'Home', 'BookOpen',
  'Shirt', 'Bike', 'Gamepad2', 'Sofa', 'Watch', 'Wrench', 'Music', 'Baby',
  'Dumbbell', 'Utensils', 'BriefcaseBusiness', 'Sparkles',
]);

const slugify = (value) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 96);

async function listCategories(req, res, next) {
  try {
    const data = await Category.findAll({ order: [['name', 'ASC']] });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

function validateCategory(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const icon = typeof body?.icon === 'string' ? body.icon : '';
  if (!name || name.length > 80) return { error: 'Category name is required and must be at most 80 characters' };
  if (!ALLOWED_ICONS.has(icon)) return { error: 'Choose a supported category icon' };
  const slug = slugify(name);
  if (!slug) return { error: 'Category name must contain letters or numbers' };
  return { data: { name, slug, icon } };
}

async function createCategory(req, res, next) {
  try {
    const result = validateCategory(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const existing = await Category.findOne({ where: { [Op.or]: [{ name: result.data.name }, { slug: result.data.slug }] } });
    if (existing) return res.status(409).json({ error: 'A category with this name already exists' });
    const data = await Category.create(result.data);
    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const result = validateCategory(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const duplicate = await Category.findOne({
      where: { id: { [Op.ne]: category.id }, [Op.or]: [{ name: result.data.name }, { slug: result.data.slug }] },
    });
    if (duplicate) return res.status(409).json({ error: 'A category with this name already exists' });
    await category.sequelize.transaction(async (transaction) => {
      if (category.name !== result.data.name) {
        await Listing.update({ category: result.data.name }, { where: { category: category.name }, transaction });
      }
      await category.update(result.data, { transaction });
    });
    return res.json({ data: category });
  } catch (error) {
    return next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (await Listing.count({ where: { category: category.name } })) {
      return res.status(409).json({ error: 'This category is used by listings. Rename it instead of deleting it.' });
    }
    await category.destroy();
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
