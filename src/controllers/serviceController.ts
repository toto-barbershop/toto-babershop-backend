import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

export const getServices = async (req: Request, res: Response) => {
  try {
    const cachedServices = await redis.get('cache:services');
    if (cachedServices) {
      return res.json(JSON.parse(cachedServices));
    }

    const services = await prisma.service.findMany({
      orderBy: { order: 'asc' }
    });
    
    await redis.set('cache:services', JSON.stringify(services), 'EX', 3600);
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

export const createService = async (req: Request, res: Response) => {
  try {
    const { name, slug, category, price, duration, description, process, image, featured, order, status } = req.body;
    
    const srvSlug = slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : `service-${Date.now()}`);

    const service = await prisma.service.create({
      data: {
        name: name || 'Unnamed Service',
        slug: srvSlug,
        category: category || 'General',
        price: price ? parseInt(price) : 0,
        duration: duration ? parseInt(duration) : 30,
        description,
        process: process || [],
        image,
        featured: featured || false,
        order: order ? parseInt(order) : 0,
        status: status || 'active'
      }
    });
    await redis.del('cache:services');
    res.json(service);
  } catch (error) {
    console.error("Error creating service:", error);
    res.status(500).json({ error: 'Failed to create service' });
  }
};

export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, category, price, duration, description, process, image, featured, order, status } = req.body;
    
    const service = await prisma.service.update({
      where: { id: parseInt(id as string) },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(category && { category }),
        ...(typeof price !== 'undefined' && { price: parseInt(price) }),
        ...(typeof duration !== 'undefined' && { duration: parseInt(duration) }),
        ...(description !== undefined && { description }),
        ...(process !== undefined && { process }),
        ...(image !== undefined && { image }),
        ...(typeof featured !== 'undefined' && { featured }),
        ...(typeof order !== 'undefined' && { order: parseInt(order) }),
        ...(status && { status })
      }
    });
    await redis.del('cache:services');
    res.json(service);
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ error: 'Failed to update service' });
  }
};

export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const service = await prisma.service.delete({
      where: { id: parseInt(id as string) }
    });
    await redis.del('cache:services');
    res.json({ success: true, service });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
};
