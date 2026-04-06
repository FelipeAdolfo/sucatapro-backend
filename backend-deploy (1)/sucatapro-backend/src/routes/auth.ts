import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../server';
import { generateToken, hashPassword, comparePassword, generateCode, generateSecureToken } from '../utils/auth';
import { sendEmail, emailTemplates } from '../utils/email';
import { authenticate } from '../middleware/auth';

const router = Router();

// Login
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha obrigatória'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (!user.active) {
      return res.status(401).json({ error: 'Usuário desativado' });
    }

    // Check password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        region: user.region,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Register with access code (first access)
router.post('/register', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
  body('name').notEmpty().withMessage('Nome obrigatório'),
  body('code').notEmpty().withMessage('Código de acesso obrigatório'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, name, phone, code } = req.body;

    // Verify access code
    const accessCode = await prisma.accessCode.findFirst({
      where: {
        email,
        code,
        status: 'pending',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (!accessCode) {
      return res.status(400).json({ error: 'Código de acesso inválido ou expirado' });
    }

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
        phone,
        role: accessCode.role,
      },
    });

    // Mark access code as used
    await prisma.accessCode.update({
      where: { id: accessCode.id },
      data: {
        status: 'used',
        usedAt: new Date(),
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      message: 'Conta criada com sucesso!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Request password reset
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;

    // Check if email is from sucalog domain
    if (!email.toLowerCase().endsWith('@sucalog.com.br')) {
      return res.status(400).json({ 
        error: 'A recuperação de senha só está disponível para emails @sucalog.com.br' 
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ 
        success: true, 
        message: 'Se o email existir, você receberá as instruções em breve' 
      });
    }

    // Generate reset token and code
    const token = generateSecureToken();
    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Save reset request
    await prisma.passwordReset.create({
      data: {
        email,
        token,
        code,
        expiresAt,
        userId: user.id,
      },
    });

    // Send email
    const emailResult = await sendEmail(
      email,
      emailTemplates.passwordReset(code, user.name)
    );

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // In development, return the code
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Código de recuperação gerado (modo desenvolvimento)',
          code, // Only in development!
        });
      }
    }

    res.json({
      success: true,
      message: 'Se o email existir, você receberá as instruções em breve',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Reset password with code
router.post('/reset-password', [
  body('code').notEmpty().withMessage('Código obrigatório'),
  body('newPassword').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { code, newPassword } = req.body;

    // Find valid reset request
    const resetRequest = await prisma.passwordReset.findFirst({
      where: {
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetRequest) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetRequest.userId },
      data: { password: hashedPassword },
    });

    // Mark reset as used
    await prisma.passwordReset.update({
      where: { id: resetRequest.id },
      data: { usedAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        avatar: true,
        createdAt: true,
        lastLoginAt: true,
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

// Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Senha atual obrigatória'),
  body('newPassword').isLength({ min: 8 }).withMessage('Nova senha deve ter no mínimo 8 caracteres'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
