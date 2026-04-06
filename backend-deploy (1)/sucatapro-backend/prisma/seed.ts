import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateId } from '../src/utils/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Create admin user (Felipe)
  const adminPassword = await bcrypt.hash('Suc@log.2026', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'felipe@sucalog.com.br' },
    update: {},
    create: {
      id: generateId(),
      email: 'felipe@sucalog.com.br',
      password: adminPassword,
      name: 'Felipe',
      role: 'director',
      status: 'active',
      emailVerified: true,
    },
  });

  console.log('✅ Usuário admin criado:', admin.email);

  // Create sample sources
  const sources = await Promise.all([
    prisma.source.upsert({
      where: { id: 'source-1' },
      update: {},
      create: {
        id: 'source-1',
        name: 'Metalúrgica São Paulo',
        type: 'industria',
        contactName: 'João Silva',
        phone: '(11) 98765-4321',
        email: 'joao@metalurgicasp.com.br',
        city: 'São Paulo',
        state: 'SP',
        status: 'active',
      },
    }),
    prisma.source.upsert({
      where: { id: 'source-2' },
      update: {},
      create: {
        id: 'source-2',
        name: 'Sucata Express',
        type: 'sucateiro',
        contactName: 'Maria Oliveira',
        phone: '(11) 91234-5678',
        email: 'maria@sucataexpress.com',
        city: 'Guarulhos',
        state: 'SP',
        status: 'active',
      },
    }),
    prisma.source.upsert({
      where: { id: 'source-3' },
      update: {},
      create: {
        id: 'source-3',
        name: 'Leilões Brasil',
        type: 'leiloeiro',
        contactName: 'Carlos Santos',
        phone: '(11) 99876-5432',
        email: 'carlos@leiloesbrasil.com.br',
        city: 'São Paulo',
        state: 'SP',
        status: 'active',
      },
    }),
  ]);

  console.log(`✅ ${sources.length} fontes criadas`);

  // Create sample opportunities
  const opportunities = await Promise.all([
    prisma.opportunity.upsert({
      where: { id: 'opp-1' },
      update: {},
      create: {
        id: 'opp-1',
        title: 'Lote de Sucata Ferrosa - Metalúrgica SP',
        description: 'Lote de sucata ferrosa de produção industrial',
        type: 'fonte',
        sellerName: 'João Silva',
        sellerContact: '(11) 98765-4321',
        city: 'São Paulo',
        state: 'SP',
        estimatedWeight: 50000,
        totalWeight: 50000,
        totalValue: 125000,
        status: 'prospecting',
        assignedTo: admin.id,
        sourceId: 'source-1',
        materials: {
          create: [
            {
              id: generateId(),
              materialType: 'ferroso',
              description: 'Sucata ferrosa mista',
              weight: 50000,
              unitPrice: 2.5,
              totalValue: 125000,
            },
          ],
        },
      },
    }),
    prisma.opportunity.upsert({
      where: { id: 'opp-2' },
      update: {},
      create: {
        id: 'opp-2',
        title: 'Lote de Alumínio - Sucata Express',
        description: 'Sucata de alumínio de diversas ligas',
        type: 'sucateiro',
        sellerName: 'Maria Oliveira',
        sellerContact: '(11) 91234-5678',
        city: 'Guarulhos',
        state: 'SP',
        estimatedWeight: 15000,
        totalWeight: 15000,
        totalValue: 105000,
        status: 'quotation',
        assignedTo: admin.id,
        sourceId: 'source-2',
        materials: {
          create: [
            {
              id: generateId(),
              materialType: 'aluminio',
              description: 'Alumínio misto',
              weight: 15000,
              unitPrice: 7.0,
              totalValue: 105000,
            },
          ],
        },
      },
    }),
    prisma.opportunity.upsert({
      where: { id: 'opp-3' },
      update: {},
      create: {
        id: 'opp-3',
        title: 'Leilão de Máquinas Industriais',
        description: 'Leilão de máquinas e equipamentos industriais para sucata',
        type: 'leilao',
        sellerName: 'Carlos Santos',
        sellerContact: '(11) 99876-5432',
        city: 'São Paulo',
        state: 'SP',
        estimatedWeight: 100000,
        totalWeight: 100000,
        totalValue: 300000,
        status: 'negotiation',
        assignedTo: admin.id,
        sourceId: 'source-3',
        materials: {
          create: [
            {
              id: generateId(),
              materialType: 'ferroso',
              description: 'Aço carbono',
              weight: 80000,
              unitPrice: 2.8,
              totalValue: 224000,
            },
            {
              id: generateId(),
              materialType: 'aluminio',
              description: 'Alumínio',
              weight: 10000,
              unitPrice: 7.2,
              totalValue: 72000,
            },
            {
              id: generateId(),
              materialType: 'cobre',
              description: 'Cobre',
              weight: 10000,
              unitPrice: 40,
              totalValue: 4000,
            },
          ],
        },
      },
    }),
  ]);

  console.log(`✅ ${opportunities.length} oportunidades criadas`);

  // Create sample activities
  const activities = await Promise.all([
    prisma.activity.create({
      data: {
        id: generateId(),
        type: 'created',
        description: 'Oportunidade criada',
        opportunityId: 'opp-1',
        userId: admin.id,
      },
    }),
    prisma.activity.create({
      data: {
        id: generateId(),
        type: 'updated',
        description: 'Status alterado para Cotação',
        opportunityId: 'opp-2',
        userId: admin.id,
      },
    }),
    prisma.activity.create({
      data: {
        id: generateId(),
        type: 'status_change',
        description: 'Status alterado para Negociação',
        opportunityId: 'opp-3',
        userId: admin.id,
      },
    }),
  ]);

  console.log(`✅ ${activities.length} atividades criadas`);

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📧 Credenciais de acesso:');
  console.log('   Email: felipe@sucalog.com.br');
  console.log('   Senha: Suc@log.2026');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
