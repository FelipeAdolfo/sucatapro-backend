import { Router } from 'express';
import { body, param } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { generateId } from '../utils/auth';

const router = Router();
const prisma = new PrismaClient();

// Public endpoint - Submit job application (no auth required)
router.post('/submit', [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('phone').notEmpty().withMessage('Telefone é obrigatório'),
  body('position').isIn(['buyer', 'partner']).withMessage('Posição inválida'),
], async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      position,
      experience,
      region,
      message,
      curriculumUrl,
    } = req.body;

    // Check if already applied with this email
    const existing = await prisma.application.findFirst({
      where: {
        email: email.toLowerCase(),
        status: { in: ['pending', 'reviewing'] },
      },
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'Você já possui uma candidatura em análise. Aguarde nosso contato.' 
      });
    }

    const application = await prisma.application.create({
      data: {
        id: generateId(),
        name,
        email: email.toLowerCase(),
        phone,
        position,
        experience: experience || null,
        region: region || null,
        message: message || null,
        curriculumUrl: curriculumUrl || null,
        status: 'pending',
      },
    });

    res.status(201).json({
      message: 'Candidatura enviada com sucesso! Entraremos em contato em breve.',
      applicationId: application.id,
    });
  } catch (error) {
    console.error('Submit application error:', error);
    res.status(500).json({ error: 'Erro ao enviar candidatura' });
  }
});

// Get all applications (admin only)
router.get('/', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const {
      status,
      position,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (position) where.position = position;
    
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { region: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.application.count({ where }),
    ]);

    res.json({
      applications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Erro ao buscar candidaturas' });
  }
});

// Get application by ID
router.get('/:id', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const application = await prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).json({ error: 'Candidatura não encontrada' });
    }

    res.json(application);
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ error: 'Erro ao buscar candidatura' });
  }
});

// Update application status
router.patch('/:id/status', authenticate, requireRole(['manager', 'director']), [
  body('status').isIn(['pending', 'reviewing', 'approved', 'rejected', 'hired']).withMessage('Status inválido'),
  body('notes').optional(),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const application = await prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).json({ error: 'Candidatura não encontrada' });
    }

    const updateData: any = { status };
    
    if (notes) {
      updateData.notes = application.notes 
        ? `${application.notes}\n[${new Date().toLocaleString()}] ${req.user!.name}: ${notes}`
        : `[${new Date().toLocaleString()}] ${req.user!.name}: ${notes}`;
    }

    const updated = await prisma.application.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Erro ao atualizar status da candidatura' });
  }
});

// Add notes to application
router.post('/:id/notes', authenticate, requireRole(['manager', 'director']), [
  body('note').notEmpty().withMessage('Nota é obrigatória'),
], async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const application = await prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).json({ error: 'Candidatura não encontrada' });
    }

    const noteEntry = `[${new Date().toLocaleString()}] ${req.user!.name}: ${note}`;
    const updatedNotes = application.notes 
      ? `${application.notes}\n${noteEntry}`
      : noteEntry;

    const updated = await prisma.application.update({
      where: { id },
      data: { notes: updatedNotes },
    });

    res.json(updated);
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Erro ao adicionar nota' });
  }
});

// Delete application
router.delete('/:id', authenticate, requireRole(['director']), async (req, res) => {
  try {
    const { id } = req.params;

    const application = await prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).json({ error: 'Candidatura não encontrada' });
    }

    await prisma.application.delete({ where: { id } });

    res.json({ message: 'Candidatura excluída com sucesso' });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Erro ao excluir candidatura' });
  }
});

// Get application statistics
router.get('/stats/summary', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const [byStatus, byPosition, total] = await Promise.all([
      prisma.application.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.application.groupBy({
        by: ['position'],
        _count: { position: true },
      }),
      prisma.application.count(),
    ]);

    // Get recent applications (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCount = await prisma.application.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    res.json({
      byStatus,
      byPosition,
      total,
      recentCount,
    });
  } catch (error) {
    console.error('Get application stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
