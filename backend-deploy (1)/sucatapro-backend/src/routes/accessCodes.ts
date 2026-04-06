import { Router } from 'express';
import { body, param } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { generateId, generateAccessCode } from '../utils/auth';
import { sendEmail, getAccessCodeEmailTemplate } from '../utils/email';

const router = Router();
const prisma = new PrismaClient();

// Get all access codes with filters
router.get('/', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const {
      status,
      email,
      role,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) where.status = status;
    if (role) where.role = role;
    if (email) where.email = { contains: email as string, mode: 'insensitive' };

    const [accessCodes, total] = await Promise.all([
      prisma.accessCode.findMany({
        where,
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.accessCode.count({ where }),
    ]);

    res.json({
      accessCodes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get access codes error:', error);
    res.status(500).json({ error: 'Erro ao buscar códigos de acesso' });
  }
});

// Get access code by ID
router.get('/:id', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const accessCode = await prisma.accessCode.findUnique({
      where: { id },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!accessCode) {
      return res.status(404).json({ error: 'Código de acesso não encontrado' });
    }

    res.json(accessCode);
  } catch (error) {
    console.error('Get access code error:', error);
    res.status(500).json({ error: 'Erro ao buscar código de acesso' });
  }
});

// Generate new access code
router.post('/', authenticate, requireRole(['manager', 'director']), [
  body('email')
    .isEmail().withMessage('Email inválido')
    .matches(/@sucalog\.com\.br$/i).withMessage('Email deve ser do domínio @sucalog.com.br'),
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('role').isIn(['buyer', 'coordinator', 'manager', 'director']).withMessage('Função inválida'),
  body('phone').optional(),
], async (req, res) => {
  try {
    const { email, name, role, phone } = req.body;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Já existe um usuário com este email' });
    }

    // Check if there's a pending access code for this email
    const existingCode = await prisma.accessCode.findFirst({
      where: {
        email: email.toLowerCase(),
        status: 'pending',
      },
    });

    if (existingCode) {
      return res.status(400).json({ 
        error: 'Já existe um código pendente para este email. Aguarde o colaborador registrar-se ou cancele o código existente.' 
      });
    }

    const code = generateAccessCode();

    const accessCode = await prisma.accessCode.create({
      data: {
        id: generateId(),
        email: email.toLowerCase(),
        name,
        role,
        phone,
        code,
        status: 'pending',
        createdBy: req.user!.id,
      },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Send email with access code
    const emailTemplate = getAccessCodeEmailTemplate(name, code);
    const emailResult = await sendEmail(email, emailTemplate);

    if (!emailResult.success) {
      console.error('Failed to send access code email:', emailResult.error);
      // Don't fail the request, but warn the admin
      res.status(201).json({
        ...accessCode,
        warning: 'Código criado, mas houve um erro ao enviar o email. Por favor, envie o código manualmente.',
        code, // Include code in response for manual sending
      });
      return;
    }

    res.status(201).json(accessCode);
  } catch (error) {
    console.error('Create access code error:', error);
    res.status(500).json({ error: 'Erro ao gerar código de acesso' });
  }
});

// Resend access code email
router.post('/:id/resend', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const accessCode = await prisma.accessCode.findUnique({
      where: { id },
    });

    if (!accessCode) {
      return res.status(404).json({ error: 'Código de acesso não encontrado' });
    }

    if (accessCode.status !== 'pending') {
      return res.status(400).json({ error: 'Código já foi utilizado ou cancelado' });
    }

    // Send email again
    const emailTemplate = getAccessCodeEmailTemplate(accessCode.name, accessCode.code);
    const emailResult = await sendEmail(accessCode.email, emailTemplate);

    if (!emailResult.success) {
      console.error('Failed to resend access code email:', emailResult.error);
      return res.status(500).json({
        error: 'Erro ao reenviar email',
        code: accessCode.code, // Include code for manual sending
      });
    }

    res.json({ message: 'Email reenviado com sucesso' });
  } catch (error) {
    console.error('Resend access code error:', error);
    res.status(500).json({ error: 'Erro ao reenviar código de acesso' });
  }
});

// Cancel access code
router.patch('/:id/cancel', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const accessCode = await prisma.accessCode.findUnique({
      where: { id },
    });

    if (!accessCode) {
      return res.status(404).json({ error: 'Código de acesso não encontrado' });
    }

    if (accessCode.status !== 'pending') {
      return res.status(400).json({ error: 'Código já foi utilizado ou cancelado' });
    }

    const updated = await prisma.accessCode.update({
      where: { id },
      data: {
        status: 'cancelled',
        metadata: { cancelledReason: reason, cancelledAt: new Date().toISOString() },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Cancel access code error:', error);
    res.status(500).json({ error: 'Erro ao cancelar código de acesso' });
  }
});

// Delete access code
router.delete('/:id', authenticate, requireRole(['director']), async (req, res) => {
  try {
    const { id } = req.params;

    const accessCode = await prisma.accessCode.findUnique({
      where: { id },
    });

    if (!accessCode) {
      return res.status(404).json({ error: 'Código de acesso não encontrado' });
    }

    await prisma.accessCode.delete({ where: { id } });

    res.json({ message: 'Código de acesso excluído com sucesso' });
  } catch (error) {
    console.error('Delete access code error:', error);
    res.status(500).json({ error: 'Erro ao excluir código de acesso' });
  }
});

export default router;
