import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../server';
import { authenticate, authorize } from '../middleware/auth';
import { hashPassword } from '../utils/auth';
import { UserRole } from '../types';

const router = Router();

// Get all users (admin only)
router.get('/', authenticate, authorize('COORDENADOR', 'GERENTE', 'DIRETOR'), async (req, res) => {
  try {
    const { role, active, search } = req.query;

    const where: any = {};
    
    if (role) where.role = role;
    if (active !== undefined) where.active = active === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
        supervisor: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Get user by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only see their own data or admins can see all
    if (req.user!.userId !== id && !['GERENTE', 'DIRETOR'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        avatar: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
        supervisor: {
          select: { id: true, name: true },
        },
        subordinates: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Create user (admin only)
router.post('/', authenticate, authorize('GERENTE', 'DIRETOR'), [
  body('name').notEmpty().withMessage('Nome obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
  body('role').isIn(['COMPRADOR', 'COORDENADOR', 'GERENTE', 'DIRETOR']).withMessage('Perfil inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { name, email, password, role, phone, region, supervisorId } = req.body;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        phone,
        region,
        supervisorId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        active: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      user,
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Update user
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only update their own data or admins can update all
    if (req.user!.userId !== id && !['GERENTE', 'DIRETOR'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { name, phone, region, supervisorId, active } = req.body;

    // Only admins can change supervisor and active status
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (region !== undefined) updateData.region = region;
    
    if (['GERENTE', 'DIRETOR'].includes(req.user!.role)) {
      if (supervisorId !== undefined) updateData.supervisorId = supervisorId;
      if (active !== undefined) updateData.active = active;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        active: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      user,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, authorize('DIRETOR'), async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (req.user!.userId === id) {
      return res.status(400).json({ error: 'Não pode excluir sua própria conta' });
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso!',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// Get user stats
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const [
      totalOpportunities,
      opportunitiesByStatus,
      totalValue,
      recentActivities,
    ] = await Promise.all([
      prisma.opportunity.count({
        where: { assignedToId: id },
      }),
      prisma.opportunity.groupBy({
        by: ['status'],
        where: { assignedToId: id },
        _count: { status: true },
      }),
      prisma.opportunity.aggregate({
        where: { assignedToId: id },
        _sum: { estimatedValue: true },
      }),
      prisma.activity.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          opportunity: {
            select: { title: true },
          },
        },
      }),
    ]);

    const closedOpportunities = opportunitiesByStatus.find(s => s.status === 'FECHADO')?._count.status || 0;
    const conversionRate = totalOpportunities > 0 ? (closedOpportunities / totalOpportunities) * 100 : 0;

    res.json({
      success: true,
      stats: {
        totalOpportunities,
        closedOpportunities,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        totalValue: totalValue._sum.estimatedValue || 0,
        opportunitiesByStatus,
        recentActivities,
      },
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
