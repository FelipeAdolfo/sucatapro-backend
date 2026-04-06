import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get opportunities report
router.get('/opportunities', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'status' } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    let report;

    switch (groupBy) {
      case 'status':
        report = await prisma.opportunity.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
          _sum: { totalValue: true, totalWeight: true },
        });
        break;

      case 'type':
        report = await prisma.opportunity.groupBy({
          by: ['type'],
          where,
          _count: { type: true },
          _sum: { totalValue: true, totalWeight: true },
        });
        break;

      case 'month':
        const opportunities = await prisma.opportunity.findMany({
          where,
          select: {
            createdAt: true,
            status: true,
            totalValue: true,
            totalWeight: true,
          },
        });

        const grouped = opportunities.reduce((acc: any, opp) => {
          const month = opp.createdAt.toISOString().slice(0, 7); // YYYY-MM
          if (!acc[month]) {
            acc[month] = { month, count: 0, totalValue: 0, totalWeight: 0 };
          }
          acc[month].count++;
          acc[month].totalValue += opp.totalValue || 0;
          acc[month].totalWeight += opp.totalWeight || 0;
          return acc;
        }, {});

        report = Object.values(grouped).sort((a: any, b: any) => a.month.localeCompare(b.month));
        break;

      case 'user':
        report = await prisma.opportunity.groupBy({
          by: ['assignedTo'],
          where,
          _count: { assignedTo: true },
          _sum: { totalValue: true, totalWeight: true },
        });

        // Add user details
        const userIds = report.map((r: any) => r.assignedTo);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        });

        report = report.map((r: any) => ({
          ...r,
          user: users.find(u => u.id === r.assignedTo),
        }));
        break;

      default:
        return res.status(400).json({ error: 'Agrupamento inválido' });
    }

    res.json(report);
  } catch (error) {
    console.error('Get opportunities report error:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de oportunidades' });
  }
});

// Get financial report
router.get('/financial', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [
      totalStats,
      wonStats,
      lostStats,
      byType,
      byMonth,
    ] = await Promise.all([
      // Total stats
      prisma.opportunity.aggregate({
        where,
        _count: true,
        _sum: { totalValue: true, totalWeight: true },
      }),

      // Won stats
      prisma.opportunity.aggregate({
        where: { ...where, status: 'won' },
        _count: true,
        _sum: { totalValue: true, totalWeight: true },
      }),

      // Lost stats
      prisma.opportunity.aggregate({
        where: { ...where, status: 'lost' },
        _count: true,
        _sum: { totalValue: true, totalWeight: true },
      }),

      // By type
      prisma.opportunity.groupBy({
        by: ['type'],
        where,
        _count: { type: true },
        _sum: { totalValue: true },
      }),

      // By month
      prisma.opportunity.findMany({
        where,
        select: {
          createdAt: true,
          status: true,
          totalValue: true,
          type: true,
        },
      }),
    ]);

    // Process monthly data
    const monthlyData = byMonth.reduce((acc: any, opp) => {
      const month = opp.createdAt.toISOString().slice(0, 7);
      if (!acc[month]) {
        acc[month] = { month, total: 0, won: 0, lost: 0 };
      }
      acc[month].total += opp.totalValue || 0;
      if (opp.status === 'won') acc[month].won += opp.totalValue || 0;
      if (opp.status === 'lost') acc[month].lost += opp.totalValue || 0;
      return acc;
    }, {});

    const closedCount = (wonStats._count || 0) + (lostStats._count || 0);
    const conversionRate = closedCount > 0 
      ? ((wonStats._count || 0) / closedCount) * 100 
      : 0;

    res.json({
      summary: {
        totalOpportunities: totalStats._count,
        totalValue: totalStats._sum.totalValue || 0,
        totalWeight: totalStats._sum.totalWeight || 0,
        wonOpportunities: wonStats._count,
        wonValue: wonStats._sum.totalValue || 0,
        wonWeight: wonStats._sum.totalWeight || 0,
        lostOpportunities: lostStats._count,
        lostValue: lostStats._sum.totalValue || 0,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgOpportunityValue: totalStats._count > 0 
          ? (totalStats._sum.totalValue || 0) / totalStats._count 
          : 0,
      },
      byType: byType.map((t: any) => ({
        type: t.type,
        count: t._count.type,
        value: t._sum.totalValue || 0,
      })),
      byMonth: Object.values(monthlyData).sort((a: any, b: any) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    console.error('Get financial report error:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório financeiro' });
  }
});

// Get approvals report
router.get('/approvals', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [
      byStatus,
      byType,
      avgResponseTime,
    ] = await Promise.all([
      // By status
      prisma.approval.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),

      // By type
      prisma.approval.groupBy({
        by: ['type'],
        where,
        _count: { type: true },
      }),

      // Average response time (for approved/rejected)
      prisma.approval.findMany({
        where: {
          ...where,
          status: { in: ['approved', 'rejected'] },
          respondedAt: { not: null },
        },
        select: {
          createdAt: true,
          respondedAt: true,
        },
      }),
    ]);

    // Calculate average response time in hours
    let totalHours = 0;
    avgResponseTime.forEach(a => {
      if (a.respondedAt) {
        const diff = a.respondedAt.getTime() - a.createdAt.getTime();
        totalHours += diff / (1000 * 60 * 60);
      }
    });
    const avgHours = avgResponseTime.length > 0 ? totalHours / avgResponseTime.length : 0;

    res.json({
      byStatus,
      byType,
      avgResponseTime: {
        hours: Math.round(avgHours * 100) / 100,
        days: Math.round((avgHours / 24) * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Get approvals report error:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de aprovações' });
  }
});

// Get activities report
router.get('/activities', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    if (userId) where.userId = userId as string;

    const [
      byType,
      byUser,
      total,
    ] = await Promise.all([
      // By type
      prisma.activity.groupBy({
        by: ['type'],
        where,
        _count: { type: true },
      }),

      // By user
      prisma.activity.groupBy({
        by: ['userId'],
        where,
        _count: { userId: true },
      }),

      // Total
      prisma.activity.count({ where }),
    ]);

    // Add user details
    const userIds = byUser.map((b: any) => b.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    res.json({
      total,
      byType,
      byUser: byUser.map((b: any) => ({
        ...b,
        user: users.find(u => u.id === b.userId),
      })),
    });
  } catch (error) {
    console.error('Get activities report error:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de atividades' });
  }
});

// Export data
router.get('/export', authenticate, requireRole(['manager', 'director']), async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    let data;

    switch (type) {
      case 'opportunities':
        data = await prisma.opportunity.findMany({
          where,
          include: {
            materials: true,
            assignedUser: { select: { name: true, email: true } },
            source: { select: { name: true } },
          },
        });
        break;

      case 'activities':
        data = await prisma.activity.findMany({
          where,
          include: {
            user: { select: { name: true, email: true } },
            opportunity: { select: { title: true } },
          },
        });
        break;

      case 'approvals':
        data = await prisma.approval.findMany({
          where,
          include: {
            requestedByUser: { select: { name: true } },
            respondedByUser: { select: { name: true } },
            opportunity: { select: { title: true } },
          },
        });
        break;

      default:
        return res.status(400).json({ error: 'Tipo de exportação inválido' });
    }

    res.json({
      type,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Erro ao exportar dados' });
  }
});

export default router;
