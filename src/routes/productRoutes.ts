import { Router } from 'express';
import { getProducts, searchProducts, createProduct, updateProduct, deleteProduct } from '../controllers/productController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getProducts);
router.get('/search', searchProducts);
router.post('/', authenticateToken, requireAdmin, createProduct);
router.put('/:id', authenticateToken, requireAdmin, updateProduct);
router.delete('/:id', authenticateToken, requireAdmin, deleteProduct);

export default router;
