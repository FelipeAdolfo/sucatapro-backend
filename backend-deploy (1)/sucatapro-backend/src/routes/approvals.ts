import { Router } from 'express';
import { body, param } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { generateId } from '../utils/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all approvals with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      status,
      type,
      opportunityId,
      requestedBy,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (opportunityId) where.opportunityId = opportunityId as string;
    if (requestedBy) where.requestedBy = requestedBy as string;

    // Buyers can only see their own approvals
    if (req.user?.role === 'buyer') {
      where.requestedBy = req.user.id;
    }

    const [approvals, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        include: {
          opportunity: {
            select: { id: true, title: true, totalValue: true },
          },
          requestedByUser: {
            select: { id: true, name: true, email: true },
          },
          respondedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.approval.count({ where }),
    ]);

    res.json({
      approvals,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ error: 'Erro ao buscar aprovações' });
  }
});

// Get pending approvals for current user
router.get('/pending', authenticate, async (req, res) => {
  try {
    const user = req.user!;
    let where: any = { status: 'pending' };

    // Filter by approval level based on user role
    if (user.role === 'coordinator') {
      where.type = 'conditional';
    } else if (user.role === 'manager') {
      where.type = { in: ['conditional', 'financial'] };
    } else if (user.role === 'director') {
      where.type = { in: ['conditional', 'financial', 'exceptional'] };
    } else {
      // Buyers don't approve
      return res.json({ approvals: [], pagination: { total: 0 } });
    }

    const approvals = await prisma.approval.findMany({
      where,
      include: {
        opportunity: {
          select: { 
            id: true, 
            title: true, 
            totalValue: true,
            sellerName: true,
            type: true,
          },
        },
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ approvals });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ error: 'Erro ao buscar aprovações pendentes' });
  }
});

// Get approval by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const approval = await prisma.approval.findUnique({
      where: { id },
      include: {
        opportunity: {
          include: {
            materials: true,
            assignedUser: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
        respondedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!approval) {
      return res.status(404).json({ error: 'Aprovação não encontrada' });
    }

    // Check permission
    if (req.user?.role === 'buyer' && approval.requestedBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(approval);
  } catch (error) {
    console.error('Get approval error:', error);
    res.status(500).json({ error: 'Erro ao buscar aprovação' });
  }
});

// Request approval
router.post('/', authenticate, [
  body('opportunityId').notEmpty().withMessage('ID da oportunidade é obrigatório'),
  body('type').isIn(['conditional', 'financial', 'exceptional']).withMessage('Tipo inválido'),
  body('description').notEmpty().withMessage('Descrição é obrigatória'),
], async (req, res) => {
  try {
    const { opportunityId, type, description, requestedChanges } = req.body;

    // Check if opportunity exists and belongs to user
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Oportunidade não encontrada' });
    }

    if (req.user?.role === 'buyer' && opportunity.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Determine approver based on type and value
    let approverRole: string;
    if (type === 'conditional') {
      approverRole = 'coordinator';
    } else if (type === 'financial') {
      approverRole = opportunity.totalValue > 100000 ? 'director' : 'manager';
    } else {
      approverRole = 'director';
    }

    // Find approver
    const approver = await prisma.user.findFirst({
      where: { role: approverRole, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });

    const approval = await prisma.approval.create({
      data: {
        id: generateId(),
        opportunityId,
        type,
        description,
        requestedChanges: requestedChanges || null,
        status: 'pending',
        requestedBy: req.user!.id,
        approverId: approver?.id || null,
      },
      include: {
        opportunity: {
          select: { id: true, title: true, totalValue: true },
        },
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        id: generateId(),
        type: 'approval_requested',
        description: `Aprovação ${type} solicitada`,
        opportunityId,
        userId: req.user!.id,
      },
    });

    res.status(201).json(approval);
  } catch (error) {
    console.error('Create approval error:', error);
    res.status(500).json({ error: 'Erro ao solicitar aprovação' });
  }
});

// Respond to approval (approve/reject)
router.post('/:id/respond', authenticate, [
  body('status').isIn(['approved', 'rejected']).withMessage('Status inválido'),
  body('response').optional(),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, response } = req.body;

    const approval = await prisma.approval.findUnique({
      where: { id },
      include: { opportunity: true },
    });

    if (!approval) {
      return res.status(404).json({ error: 'Aprovação não encontrada' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: 'Aprovação já foi respondida' });
    }

    // Check if user can approve based on role
    const userRole = req.user?.role;
    const canApprove = 
      (approval.type === 'conditional' && ['coordinator', 'manager', 'director'].includes(userRole || '')) ||
      (approval.type === 'financial' && ['manager', 'director'].includes(userRole || '')) ||
      (approval.type === 'exceptional' && userRole === 'director');

    if (!canApprove) {
      return res.status(403).json({ error: 'Você não tem permissão para aprovar esta solicitação' });
    }

    const updatedApproval = await prisma.approval.update({
      where: { id },
      data: {
        status,
        response: response || null,
        respondedAt: new Date(),
        respondedBy: req.user!.id,
      },
      include: {
        opportunity: {
          select: { id: true, title: true, totalValue: true },
        },
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
        respondedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        id: generateId(),
        type: status === 'approved' ? 'approval_approved' : 'approval_rejected',
        description: `Aprovação ${status === 'approved' ? 'aprovada' : 'rejeitada'}${response ? `: ${response}` : ''}`,
        opportunityId: approval.opportunityId,
        userId: req.user!.id,
      },
    });

    // If approved and conditional, update opportunity status
    if (status === 'approved' && approval.type === 'conditional') {
      await prisma.opportunity.update({
        where: { id: approval.opportunityId },
        data: { status: 'negotiation' },
      });
    }

    res.json(updatedApproval);
  } catch (error) {
    console.error('Respond to approval error:', error);
    res.status(500).json({ error: 'Erro ao responder aprovação' });
  }
});

// Cancel approval request
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const approval = await prisma.approval.findUnique({
      where: { id },
    });

    if (!approval) {
      return res.status(404).json({ error: 'Aprovação não encontrada' });
    }

    // Only requester or managers can cancel
    if (approval.requestedBy !== req.user?.id && !['manager', 'director'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: 'Não é possível cancelar aprovação já respondida' });
    }

    await prisma.approval.delete({ where: { id } });

    res.json({ message: 'Solicitação de aprovação cancelada' });
  } catch (error) {
    console.error('Cancel approval error:', error);
    res.status(500).json({ error: 'Erro ao cancelar aprovação' });
  }
});

export default router;
