import { Router } from 'express';
import { body, param } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { generateId } from '../utils/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all sources with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      status,
      type,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (type) where.type = type;
    
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { contactName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [sources, total] = await Promise.all([
      prisma.source.findMany({
        where,
        include: {
          _count: {
            select: { opportunities: true },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limitNum,
      }),
      prisma.source.count({ where }),
    ]);

    res.json({
      sources,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get sources error:', error);
    res.status(500).json({ error: 'Erro ao buscar fontes' });
  }
});

// Get source by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        opportunities: {
          select: {
            id: true,
            title: true,
            status: true,
            totalValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { opportunities: true },
        },
      },
    });

    if (!source) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    res.json(source);
  } catch (error) {
    console.error('Get source error:', error);
    res.status(500).json({ error: 'Erro ao buscar fonte' });
  }
});

// Create source
router.post('/', authenticate, [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('type').isIn(['sucateiro', 'industria', 'leiloeiro', 'cooperativa', 'outro']).withMessage('Tipo inválido'),
], async (req, res) => {
  try {
    const {
      name,
      type,
      contactName,
      phone,
      email,
      address,
      city,
      state,
      notes,
    } = req.body;

    const source = await prisma.source.create({
      data: {
        id: generateId(),
        name,
        type,
        contactName,
        phone,
        email,
        address,
        city,
        state,
        notes,
        status: 'active',
      },
    });

    res.status(201).json(source);
  } catch (error) {
    console.error('Create source error:', error);
    res.status(500).json({ error: 'Erro ao criar fonte' });
  }
});

// Update source
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existing = await prisma.source.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    const source = await prisma.source.update({
      where: { id },
      data: updateData,
    });

    res.json(source);
  } catch (error) {
    console.error('Update source error:', error);
    res.status(500).json({ error: 'Erro ao atualizar fonte' });
  }
});

// Delete source
router.delete('/:id', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.source.findUnique({
      where: { id },
      include: { _count: { select: { opportunities: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    if (existing._count.opportunities > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir fonte com oportunidades associadas' 
      });
    }

    await prisma.source.delete({ where: { id } });

    res.json({ message: 'Fonte excluída com sucesso' });
  } catch (error) {
    console.error('Delete source error:', error);
    res.status(500).json({ error: 'Erro ao excluir fonte' });
  }
});

export default router;
