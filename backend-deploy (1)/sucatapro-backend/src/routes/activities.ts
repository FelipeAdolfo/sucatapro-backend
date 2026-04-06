import { Router } from 'express';
import { body, param } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { generateId } from '../utils/auth';

const router = Router();
const prisma = new PrismaClient();

// Get activities with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      opportunityId,
      userId,
      type,
      startDate,
      endDate,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (opportunityId) where.opportunityId = opportunityId as string;
    if (userId) where.userId = userId as string;
    if (type) where.type = type;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          opportunity: {
            select: { id: true, title: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Erro ao buscar atividades' });
  }
});

// Get activity by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        opportunity: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Erro ao buscar atividade' });
  }
});

// Create activity
router.post('/', authenticate, [
  body('opportunityId').notEmpty().withMessage('ID da oportunidade é obrigatório'),
  body('type').notEmpty().withMessage('Tipo é obrigatório'),
  body('description').notEmpty().withMessage('Descrição é obrigatória'),
], async (req, res) => {
  try {
    const { opportunityId, type, description, metadata } = req.body;

    // Check if opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Check permission
    if (req.user?.role === 'buyer' && opportunity.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const activity = await prisma.activity.create({
      data: {
        id: generateId(),
        opportunityId,
        type,
        description,
        metadata: metadata || null,
        userId: req.user!.id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        opportunity: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Erro ao criar atividade' });
  }
});

// Update activity
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, metadata } = req.body;

    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada' });
    }

    // Only creator or managers can update
    if (activity.userId !== req.user?.id && !['manager', 'director'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: {
        description: description || activity.description,
        metadata: metadata || activity.metadata,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        opportunity: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    res.json(updatedActivity);
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ error: 'Erro ao atualizar atividade' });
  }
});

// Delete activity
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      return res.status(404).json({ error: 'Atividade não encontrada' });
    }

    // Only creator or managers can delete
    if (activity.userId !== req.user?.id && !['manager', 'director'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await prisma.activity.delete({ where: { id } });

    res.json({ message: 'Atividade excluída com sucesso' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ error: 'Erro ao excluir atividade' });
  }
});

// Get activity types summary
router.get('/summary/types', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const where: any = {};
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    if (userId) where.userId = userId as string;

    const summary = await prisma.activity.groupBy({
      by: ['type'],
      where,
      _count: { type: true },
    });

    res.json(summary);
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ error: 'Erro ao buscar resumo de atividades' });
  }
});

export default router;
