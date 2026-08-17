import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, slug, parent, description, productCount } = req.body;
    
    const catSlug = slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : `category-${Date.now()}`);

    const category = await prisma.category.create({
      data: {
        name: name || 'Unnamed Category',
        slug: catSlug,
        parent,
        description,
        productCount: productCount ? parseInt(productCount) : 0
      }
    });
    res.json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: 'Failed to create category' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, parent, description, productCount } = req.body;
    
    const category = await prisma.category.update({
      where: { id: parseInt(id as string) },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(parent !== undefined && { parent }),
        ...(description !== undefined && { description }),
        ...(typeof productCount !== 'undefined' && { productCount: parseInt(productCount) })
      }
    });
    res.json(category);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const category = await prisma.category.delete({
      where: { id: parseInt(id as string) }
    });
    res.json({ success: true, category });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};
