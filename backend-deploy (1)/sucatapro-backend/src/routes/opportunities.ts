import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { generateId } from '../utils/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all opportunities with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      status,
      type,
      assignedTo,
      sourceId,
      search,
      startDate,
      endDate,
      minValue,
      maxValue,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (assignedTo) where.assignedTo = assignedTo as string;
    if (sourceId) where.sourceId = sourceId as string;
    
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { sellerName: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    if (minValue || maxValue) {
      where.totalValue = {};
      if (minValue) where.totalValue.gte = parseFloat(minValue as string);
      if (maxValue) where.totalValue.lte = parseFloat(maxValue as string);
    }

    // Buyers can only see their own opportunities
    if (req.user?.role === 'buyer') {
      where.assignedTo = req.user.id;
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: {
          materials: true,
          assignedUser: {
            select: { id: true, name: true, email: true },
          },
          source: true,
          _count: {
            select: { activities: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.opportunity.count({ where }),
    ]);

    res.json({
      opportunities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ error: 'Erro ao buscar oportunidades' });
  }
});

// Get opportunity by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        materials: true,
        financials: true,
        assignedUser: {
          select: { id: true, name: true, email: true, phone: true },
        },
        source: true,
        activities: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        approvals: {
          include: {
            requestedBy: {
              select: { id: true, name: true },
            },
            respondedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Check permission
    if (req.user?.role === 'buyer' && opportunity.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(opportunity);
  } catch (error) {
    console.error('Get opportunity error:', error);
    res.status(500).json({ error: 'Erro ao buscar oportunidade' });
  }
});

// Create opportunity
router.post('/', authenticate, [
  body('title').notEmpty().withMessage('Título é obrigatório'),
  body('type').isIn(['sucateiro', 'spot', 'leilao', 'fonte']).withMessage('Tipo inválido'),
  body('materials').isArray({ min: 1 }).withMessage('Pelo menos um material é obrigatório'),
], async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      sellerName,
      sellerContact,
      city,
      state,
      estimatedWeight,
      materials,
      sourceId,
    } = req.body;

    // Calculate totals from materials
    const totalWeight = materials.reduce((sum: number, m: any) => sum + (m.weight || 0), 0);
    const totalValue = materials.reduce((sum: number, m: any) => sum + (m.totalValue || 0), 0);

    const opportunity = await prisma.opportunity.create({
      data: {
        id: generateId(),
        title,
        description,
        type,
        sellerName,
        sellerContact,
        city,
        state,
        estimatedWeight,
        totalWeight,
        totalValue,
        status: 'prospecting',
        assignedTo: req.user!.id,
        sourceId,
        materials: {
          create: materials.map((m: any) => ({
            id: generateId(),
            materialType: m.materialType,
            description: m.description,
            weight: m.weight,
            unitPrice: m.unitPrice,
            totalValue: m.totalValue,
          })),
        },
      },
      include: {
        materials: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        id: generateId(),
        type: 'created',
        description: 'Oportunidade criada',
        opportunityId: opportunity.id,
        userId: req.user!.id,
      },
    });

    res.status(201).json(opportunity);
  } catch (error) {
    console.error('Create opportunity error:', error);
    res.status(500).json({ error: 'Erro ao criar oportunidade' });
  }
});

// Update opportunity
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existing = await prisma.opportunity.findUnique({
      where: { id },
      include: { materials: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Check permission
    if (req.user?.role === 'buyer' && existing.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Recalculate totals if materials changed
    if (updateData.materials) {
      updateData.totalWeight = updateData.materials.reduce(
        (sum: number, m: any) => sum + (m.weight || 0),
        0
      );
      updateData.totalValue = updateData.materials.reduce(
        (sum: number, m: any) => sum + (m.totalValue || 0),
        0
      );

      // Delete old materials and create new ones
      await prisma.material.deleteMany({ where: { opportunityId: id } });
      await prisma.material.createMany({
        data: updateData.materials.map((m: any) => ({
          id: generateId(),
          opportunityId: id,
          materialType: m.materialType,
          description: m.description,
          weight: m.weight,
          unitPrice: m.unitPrice,
          totalValue: m.totalValue,
        })),
      });
      delete updateData.materials;
    }

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: updateData,
      include: {
        materials: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        id: generateId(),
        type: 'updated',
        description: 'Oportunidade atualizada',
        opportunityId: id,
        userId: req.user!.id,
      },
    });

    res.json(opportunity);
  } catch (error) {
    console.error('Update opportunity error:', error);
    res.status(500).json({ error: 'Erro ao atualizar oportunidade' });
  }
});

// Update opportunity status (Kanban move)
router.patch('/:id/status', authenticate, [
  body('status').isIn(['prospecting', 'quotation', 'negotiation', 'approved', 'won', 'lost']).withMessage('Status inválido'),
  body('lossReason').optional(),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, lossReason } = req.body;

    const existing = await prisma.opportunity.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Check permission
    if (req.user?.role === 'buyer' && existing.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updateData: any = { status };
    if (status === 'lost' && lossReason) {
      updateData.lossReason = lossReason;
    }
    if (status === 'won') {
      updateData.wonAt = new Date();
    }

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: updateData,
      include: {
        materials: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    const statusLabels: Record<string, string> = {
      prospecting: 'Prospecção',
      quotation: 'Cotação',
      negotiation: 'Negociação',
      approved: 'Aprovada',
      won: 'Ganha',
      lost: 'Perdida',
    };

    await prisma.activity.create({
      data: {
        id: generateId(),
        type: 'status_change',
        description: `Status alterado para ${statusLabels[status]}`,
        opportunityId: id,
        userId: req.user!.id,
      },
    });

    res.json(opportunity);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Transfer opportunity to another user
router.post('/:id/transfer', authenticate, [
  body('userId').notEmpty().withMessage('ID do usuário é obrigatório'),
  body('reason').optional(),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, reason } = req.body;

    const existing = await prisma.opportunity.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Only coordinators, managers, directors can transfer
    if (!['coordinator', 'manager', 'director'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const oldAssignee = existing.assignedTo;

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: { assignedTo: userId },
      include: {
        materials: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    const oldUser = await prisma.user.findUnique({
      where: { id: oldAssignee },
      select: { name: true },
    });
    const newUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    await prisma.activity.create({
      data: {
        id: generateId(),
        type: 'transfer',
        description: `Transferida de ${oldUser?.name || 'Desconhecido'} para ${newUser?.name || 'Desconhecido'}${reason ? `. Motivo: ${reason}` : ''}`,
        opportunityId: id,
        userId: req.user!.id,
      },
    });

    res.json(opportunity);
  } catch (error) {
    console.error('Transfer opportunity error:', error);
    res.status(500).json({ error: 'Erro ao transferir oportunidade' });
  }
});

// Delete opportunity
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.opportunity.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    // Only managers and directors can delete
    if (!['manager', 'director'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await prisma.opportunity.delete({ where: { id } });

    res.json({ message: 'Oportunidade excluída com sucesso' });
  } catch (error) {
    console.error('Delete opportunity error:', error);
    res.status(500).json({ error: 'Erro ao excluir oportunidade' });
  }
});

export default router;
