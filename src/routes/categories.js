const express = require('express');
const { requireAdmin, requireAdminPermission } = require('../middleware/auth');
const categoriesController = require('../controllers/categoriesController');

const router = express.Router();
router.get('/', categoriesController.listCategories);
router.post('/', requireAdmin, requireAdminPermission('categories:manage'), categoriesController.createCategory);
router.patch('/:id', requireAdmin, requireAdminPermission('categories:manage'), categoriesController.updateCategory);
router.delete('/:id', requireAdmin, requireAdminPermission('categories:manage'), categoriesController.deleteCategory);

module.exports = router;
