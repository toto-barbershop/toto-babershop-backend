import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '');

const normalizeTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean))]
    : [];

const validateVariants = (variants: unknown, basePrice: number) => {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Sản phẩm phải có ít nhất một biến thể.');
  }

  const skus = new Set<string>();
  for (const variant of variants) {
    const sku = typeof variant?.sku === 'string' ? variant.sku.trim() : '';
    const price = Number(variant?.price ?? basePrice);
    const stock = Number(variant?.stock ?? 0);
    if (!sku) throw new Error('Mỗi biến thể phải có SKU.');
    if (skus.has(sku.toUpperCase())) throw new Error('SKU của các biến thể không được trùng nhau.');
    if (!Number.isInteger(price) || price <= 0) throw new Error('Giá biến thể phải là số nguyên lớn hơn 0.');
    if (!Number.isInteger(stock) || stock < 0) throw new Error('Tồn kho biến thể không hợp lệ.');
    skus.add(sku.toUpperCase());
  }
};

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
    const { name, title, description, price, basePrice, compareAtPrice, image, images, category, type, collection, status, featured, slug, tags, variants } = req.body;
    
    const finalName = name || title;
    if (!finalName?.trim()) return res.status(400).json({ error: 'Tên sản phẩm là bắt buộc.' });
    if (!category) return res.status(400).json({ error: 'Danh mục sản phẩm là bắt buộc.' });
    const finalSlug = slugify(slug || finalName) || `product-${Date.now()}`;
    const finalBasePrice = Number(typeof basePrice !== 'undefined' ? basePrice : price);
    if (!Number.isInteger(finalBasePrice) || finalBasePrice <= 0) return res.status(400).json({ error: 'Giá bán phải là số nguyên lớn hơn 0.' });
    const finalCompareAtPrice = compareAtPrice === undefined || compareAtPrice === null || compareAtPrice === '' ? null : Number(compareAtPrice);
    if (finalCompareAtPrice !== null && (!Number.isInteger(finalCompareAtPrice) || finalCompareAtPrice <= finalBasePrice)) {
      return res.status(400).json({ error: 'Giá gốc phải là số nguyên lớn hơn giá bán.' });
    }
    validateVariants(variants, finalBasePrice);
    const finalImages = images && images.length > 0 ? images : (image ? [image] : []);
    const finalStatus = status || 'draft';
    if (!['active', 'draft', 'archived'].includes(finalStatus)) return res.status(400).json({ error: 'Trạng thái sản phẩm không hợp lệ.' });
    if (finalStatus === 'active' && finalImages.length === 0) return res.status(400).json({ error: 'Sản phẩm đang bán cần có ít nhất một hình ảnh.' });

    const productData: any = { 
      name: finalName.trim(),
      slug: finalSlug,
      description, 
      basePrice: finalBasePrice, 
      compareAtPrice: finalCompareAtPrice,
      images: finalImages, 
      category,
      collection: collection || type,
      status: finalStatus,
      featured: featured || false,
      tags: normalizeTags(tags),
    };

    if (variants && variants.length > 0) {
      productData.variants = {
        create: variants.map((v: any) => ({
          name: v.name,
          size: v.options?.size || v.size,
          color: v.options?.color || v.color,
          options: v.options,
          price: v.price ?? finalBasePrice,
          stock: Math.max(0, parseInt(v.stock) || 0),
          compareAtPrice: v.compareAtPrice ?? null,
          sku: v.sku.trim()
        }))
      };
    }

    const product = await prisma.product.create({
      data: productData,
      include: { variants: true }
    });
    await redis.del('cache:products');
    res.json(product);
  } catch (error: any) {
    console.error("Error creating product:", error);
    if (error.code === 'P2002') return res.status(409).json({ error: 'Slug hoặc SKU đã tồn tại.' });
    res.status(400).json({ error: error.message || 'Không thể tạo sản phẩm.' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id as string);
    const { name, title, description, price, basePrice, compareAtPrice, image, images, category, type, collection, status, featured, slug, tags, variants } = req.body;
    
    // Support both frontend structures (old structure with price/image, new structure with basePrice/images)
    const finalName = name || title;
    const productSlug = slug ? slugify(slug) : (finalName ? slugify(finalName) : undefined);
    const suppliedBasePrice = typeof basePrice !== 'undefined' ? basePrice : price;
    const finalBasePrice = suppliedBasePrice === undefined ? undefined : Number(suppliedBasePrice);
    if (finalBasePrice !== undefined && (!Number.isInteger(finalBasePrice) || finalBasePrice <= 0)) {
      return res.status(400).json({ error: 'Giá bán phải là số nguyên lớn hơn 0.' });
    }
    const finalCompareAtPrice = compareAtPrice === undefined ? undefined : (compareAtPrice === null || compareAtPrice === '' ? null : Number(compareAtPrice));
    if (finalCompareAtPrice !== undefined && finalCompareAtPrice !== null && (!Number.isInteger(finalCompareAtPrice) || (finalBasePrice !== undefined && finalCompareAtPrice <= finalBasePrice))) {
      return res.status(400).json({ error: 'Giá gốc phải là số nguyên lớn hơn giá bán.' });
    }
    if (variants !== undefined) validateVariants(variants, finalBasePrice ?? 0);
    if (status !== undefined && !['active', 'draft', 'archived'].includes(status)) return res.status(400).json({ error: 'Trạng thái sản phẩm không hợp lệ.' });
    const finalImages = images && images.length > 0 ? images : (image ? [image] : undefined);

    // Xử lý các variant cũ bị gỡ bỏ khỏi sản phẩm
    if (variants && Array.isArray(variants)) {
      const keepVariantIds = variants
        .map((v: any) => (typeof v.id === 'number' ? v.id : parseInt(v.id)))
        .filter((vId: number) => !isNaN(vId) && vId > 0);

      // Tìm các variant cũ không còn nằm trong danh sách cập nhật
      const oldVariants = await prisma.productVariant.findMany({
        where: {
          productId,
          id: { notIn: keepVariantIds }
        },
        select: {
          id: true,
          _count: {
            select: { orderItems: true }
          }
        }
      });

      // Chỉ xóa các variant chưa từng phát sinh đơn hàng (tránh lỗi Foreign Key Constraint)
      const variantIdsToDelete = oldVariants
        .filter(v => v._count.orderItems === 0)
        .map(v => v.id);

      if (variantIdsToDelete.length > 0) {
        await prisma.productVariant.deleteMany({
          where: { id: { in: variantIdsToDelete } }
        });
      }

      // Với các variant đã có trong đơn hàng lịch sử, không thể xóa cứng -> đưa stock về 0
      const variantIdsToArchive = oldVariants
        .filter(v => v._count.orderItems > 0)
        .map(v => v.id);

      if (variantIdsToArchive.length > 0) {
        await prisma.productVariant.updateMany({
          where: { id: { in: variantIdsToArchive } },
          data: { stock: 0 }
        });
      }
    }
    
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(finalName && { name: finalName }),
        ...(productSlug && { slug: productSlug }),
        ...(description !== undefined && { description }),
        ...(typeof finalBasePrice !== 'undefined' && { basePrice: finalBasePrice }),
        ...(finalCompareAtPrice !== undefined && { compareAtPrice: finalCompareAtPrice }),
        ...(finalImages !== undefined && { images: finalImages }),
        ...(category && { category }),
        ...(collection !== undefined && { collection: collection?.trim() || null }),
        ...(type && collection === undefined && { collection: type }),
        ...(status && { status }),
        ...(typeof featured !== 'undefined' && { featured }),
        ...(variants && Array.isArray(variants) && {
        ...(tags !== undefined && { tags: normalizeTags(tags) }),
          variants: {
            upsert: variants.map((v: any) => {
              const numId = typeof v.id === 'number' ? v.id : parseInt(v.id);
              const safeStock = Math.max(0, parseInt(v.stock) || 0);
              return {
                where: { id: !isNaN(numId) && numId > 0 ? numId : -1 },
                update: {
                  name: v.name,
                  size: v.options?.size || v.size,
                  color: v.options?.color || v.color,
                  options: v.options,
                  price: v.price ?? finalBasePrice ?? 0,
                  stock: safeStock,
                  sku: v.sku.trim()
                },
                create: {
                  name: v.name,
                  size: v.options?.size || v.size,
                  color: v.options?.color || v.color,
                  options: v.options,
                  price: v.price ?? finalBasePrice ?? 0,
                  stock: safeStock,
                  compareAtPrice: v.compareAtPrice ?? null,
                  sku: v.sku.trim()
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
  } catch (error: any) {
    console.error("Error updating product:", error);
    if (error.code === 'P2002') return res.status(409).json({ error: 'Slug hoặc SKU đã tồn tại.' });
    res.status(400).json({ error: error.message || 'Không thể cập nhật sản phẩm.' });
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
