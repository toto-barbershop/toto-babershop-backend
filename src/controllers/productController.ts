import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

export const getProducts = async (req: Request, res: Response) => {
  try {
    const cachedProducts = await redis.get('cache:products');
    if (cachedProducts) {
      return res.json(JSON.parse(cachedProducts));
    }

    const products = await prisma.product.findMany({
      include: { variants: true }
    });
    // Map data for frontend (e.g. name -> title)
    const mappedProducts = products.map((p: any) => ({
      ...p,
      title: p.name,
      seo: {
        metaTitle: p.seoTitle,
        metaDescription: p.seoDescription
      }
    }));
    
    await redis.set('cache:products', JSON.stringify(mappedProducts), 'EX', 3600);
    res.json(mappedProducts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

export const searchProducts = async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }

    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } }
        ]
      },
      include: { variants: true }
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search products' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, title, description, price, basePrice, image, images, category, type, collection, status, featured, variants } = req.body;
    
    const finalName = name || title;
    const finalSlug = finalName ? finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : `product-${Date.now()}`;
    const finalBasePrice = typeof basePrice !== 'undefined' ? basePrice : (typeof price === 'number' ? price : parseInt(price) || 0);
    const finalImages = images && images.length > 0 ? images : (image ? [image] : []);

    const product = await prisma.product.create({
      data: { 
        name: finalName || 'Unnamed Product', 
        slug: finalSlug,
        description, 
        basePrice: finalBasePrice, 
        images: finalImages, 
        category: category || 'General',
        collection: collection || type,
        status: status || 'active',
        featured: featured || false,
        variants: variants && variants.length > 0 ? {
          create: variants.map((v: any) => ({
            name: v.name,
            size: v.options?.size || v.size,
            color: v.options?.color || v.color,
            options: v.options,
            price: v.price ?? finalBasePrice,
            stock: v.stock ?? 0,
            sku: v.sku
          }))
        } : undefined
      },
      include: { variants: true }
    });
    await redis.del('cache:products');
    res.json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: 'Failed to create product' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, title, description, price, basePrice, image, images, category, type, collection, status, featured, slug, variants } = req.body;
    
    // Support both frontend structures (old structure with price/image, new structure with basePrice/images)
    const finalName = name || title;
    const productSlug = slug || (finalName ? finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : undefined);
    const finalBasePrice = typeof basePrice !== 'undefined' ? basePrice : (typeof price === 'number' ? price : parseInt(price) || undefined);
    const finalImages = images && images.length > 0 ? images : (image ? [image] : undefined);
    
    const product = await prisma.product.update({
      where: { id: parseInt(id as string) },
      data: {
        ...(finalName && { name: finalName }),
        ...(productSlug && { slug: productSlug }),
        ...(description !== undefined && { description }),
        ...(typeof finalBasePrice !== 'undefined' && { basePrice: finalBasePrice }),
        ...(finalImages !== undefined && { images: finalImages }),
        ...(category && { category }),
        ...(collection && { collection }),
        ...(type && !collection && { collection: type }),
        ...(status && { status }),
        ...(typeof featured !== 'undefined' && { featured }),
        ...(variants && {
          variants: {
            deleteMany: {
              id: {
                notIn: variants
                  .map((v: any) => (typeof v.id === 'number' ? v.id : parseInt(v.id)))
                  .filter((id: number) => !isNaN(id))
              }
            },
            upsert: variants.map((v: any) => {
              const numId = typeof v.id === 'number' ? v.id : parseInt(v.id);
              return {
                where: { id: !isNaN(numId) ? numId : -1 },
                update: {
                  name: v.name,
                  size: v.options?.size || v.size,
                  color: v.options?.color || v.color,
                  options: v.options,
                  price: v.price ?? finalBasePrice ?? 0,
                  stock: v.stock ?? 0,
                  sku: v.sku
                },
                create: {
                  name: v.name,
                  size: v.options?.size || v.size,
                  color: v.options?.color || v.color,
                  options: v.options,
                  price: v.price ?? finalBasePrice ?? 0,
                  stock: v.stock ?? 0,
                  sku: v.sku
                }
              };
            })
          }
        })
      },
      include: { variants: true }
    });
    await redis.del('cache:products');
    res.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: 'Failed to update product' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Delete associated variants and order items first if needed, or rely on cascade.
    // In Prisma, relation onDelete might need to be set, but let's assume we can delete product directly
    // or we delete variants first manually just in case
    await prisma.productVariant.deleteMany({ where: { productId: parseInt(id as string) } });
    
    const product = await prisma.product.delete({
      where: { id: parseInt(id as string) }
    });
    await redis.del('cache:products');
    res.json({ success: true, product });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};
