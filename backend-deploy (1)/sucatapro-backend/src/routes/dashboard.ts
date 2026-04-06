import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get dashboard metrics
router.get('/metrics', authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    // Base where clause for opportunities
    const oppWhere: any = {};
    if (startDate || endDate) {
      oppWhere.createdAt = dateFilter;
    }

    // Buyers only see their own data
    if (user.role === 'buyer') {
      oppWhere.assignedTo = user.id;
    }

    const [
      totalOpportunities,
      opportunitiesByStatus,
      opportunitiesByType,
      wonOpportunities,
      lostOpportunities,
      totalValue,
      wonValue,
      pendingApprovals,
      recentActivities,
      topSources,
    ] = await Promise.all([
      // Total opportunities
      prisma.opportunity.count({ where: oppWhere }),

      // Opportunities by status
      prisma.opportunity.groupBy({
        by: ['status'],
        where: oppWhere,
        _count: { status: true },
      }),

      // Opportunities by type
      prisma.opportunity.groupBy({
        by: ['type'],
        where: oppWhere,
        _count: { type: true },
      }),

      // Won opportunities
      prisma.opportunity.count({
        where: { ...oppWhere, status: 'won' },
      }),

      // Lost opportunities
      prisma.opportunity.count({
        where: { ...oppWhere, status: 'lost' },
      }),

      // Total value
      prisma.opportunity.aggregate({
        where: oppWhere,
        _sum: { totalValue: true },
      }),

      // Won value
      prisma.opportunity.aggregate({
        where: { ...oppWhere, status: 'won' },
        _sum: { totalValue: true },
      }),

      // Pending approvals
      prisma.approval.count({
        where: { status: 'pending' },
      }),

      // Recent activities
      prisma.activity.findMany({
        where: user.role === 'buyer' ? { userId: user.id } : undefined,
        include: {
          user: { select: { name: true } },
          opportunity: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Top sources
      prisma.source.findMany({
        include: {
          _count: { select: { opportunities: true } },
        },
        orderBy: { opportunities: { _count: 'desc' } },
        take: 5,
      }),
    ]);

    // Calculate conversion rate
    const closedOpportunities = wonOpportunities + lostOpportunities;
    const conversionRate = closedOpportunities > 0 
      ? (wonOpportunities / closedOpportunities) * 100 
      : 0;

    // Calculate average opportunity value
    const avgOpportunityValue = totalOpportunities > 0
      ? (totalValue._sum.totalValue || 0) / totalOpportunities
      : 0;

    res.json({
      opportunities: {
        total: totalOpportunities,
        byStatus: opportunitiesByStatus,
        byType: opportunitiesByType,
        won: wonOpportunities,
        lost: lostOpportunities,
        conversionRate: Math.round(conversionRate * 100) / 100,
      },
      financials: {
        totalValue: totalValue._sum.totalValue || 0,
        wonValue: wonValue._sum.totalValue || 0,
        avgOpportunityValue: Math.round(avgOpportunityValue * 100) / 100,
      },
      approvals: {
        pending: pendingApprovals,
      },
      recentActivities,
      topSources: topSources.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        opportunityCount: s._count.opportunities,
      })),
    });
  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas do dashboard' });
  }
});

// Get pipeline data for Kanban
router.get('/pipeline', authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const { type, sourceId } = req.query;

    const where: any = {};
    
    if (type) where.type = type;
    if (sourceId) where.sourceId = sourceId as string;
    
    // Buyers only see their own opportunities
    if (user.role === 'buyer') {
      where.assignedTo = user.id;
    }

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        materials: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
        source: {
          select: { id: true, name: true },
        },
        _count: {
          select: { activities: true, approvals: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Group by status
    const pipeline = {
      prospecting: opportunities.filter(o => o.status === 'prospecting'),
      quotation: opportunities.filter(o => o.status === 'quotation'),
      negotiation: opportunities.filter(o => o.status === 'negotiation'),
      approved: opportunities.filter(o => o.status === 'approved'),
      won: opportunities.filter(o => o.status === 'won'),
      lost: opportunities.filter(o => o.status === 'lost'),
    };

    res.json(pipeline);
  } catch (error) {
    console.error('Get pipeline error:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do pipeline' });
  }
});

// Get team performance
router.get('/team-performance', authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const { startDate, endDate } = req.query;

    // Only managers and directors can see team performance
    if (!['manager', 'director'].includes(user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const users = await prisma.user.findMany({
      where: { 
        status: 'active',
        role: { in: ['buyer', 'coordinator'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    const performance = await Promise.all(
      users.map(async (u) => {
        const oppWhere: any = { assignedTo: u.id };
        if (startDate || endDate) {
          oppWhere.createdAt = dateFilter;
        }

        const [
          totalOpportunities,
          wonOpportunities,
          lostOpportunities,
          totalValue,
          wonValue,
        ] = await Promise.all([
          prisma.opportunity.count({ where: oppWhere }),
          prisma.opportunity.count({ where: { ...oppWhere, status: 'won' } }),
          prisma.opportunity.count({ where: { ...oppWhere, status: 'lost' } }),
          prisma.opportunity.aggregate({
            where: oppWhere,
            _sum: { totalValue: true },
          }),
          prisma.opportunity.aggregate({
            where: { ...oppWhere, status: 'won' },
            _sum: { totalValue: true },
          }),
        ]);

        const closedOpportunities = wonOpportunities + lostOpportunities;
        const conversionRate = closedOpportunities > 0
          ? (wonOpportunities / closedOpportunities) * 100
          : 0;

        return {
          user: u,
          opportunities: {
            total: totalOpportunities,
            won: wonOpportunities,
            lost: lostOpportunities,
            conversionRate: Math.round(conversionRate * 100) / 100,
          },
          financials: {
            totalValue: totalValue._sum.totalValue || 0,
            wonValue: wonValue._sum.totalValue || 0,
          },
        };
      })
    );

    res.json(performance);
  } catch (error) {
    console.error('Get team performance error:', error);
    res.status(500).json({ error: 'Erro ao buscar desempenho da equipe' });
  }
});

// Get monthly trends
router.get('/trends', authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const { months = '6' } = req.query;
    const monthsCount = parseInt(months as string);

    const trends = [];
    const now = new Date();

    for (let i = monthsCount - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const where: any = {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      };

      if (user.role === 'buyer') {
        where.assignedTo = user.id;
      }

      const [
        newOpportunities,
        wonOpportunities,
        wonValue,
      ] = await Promise.all([
        prisma.opportunity.count({ where }),
        prisma.opportunity.count({
          where: {
            ...where,
            status: 'won',
          },
        }),
        prisma.opportunity.aggregate({
          where: {
            ...where,
            status: 'won',
          },
          _sum: { totalValue: true },
        }),
      ]);

      trends.push({
        month: monthStart.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }),
        newOpportunities,
        wonOpportunities,
        wonValue: wonValue._sum.totalValue || 0,
      });
    }

    res.json(trends);
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({ error: 'Erro ao buscar tendências' });
  }
});

export default router;
