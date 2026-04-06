import { UserRole, OpportunityStatus, OpportunityType, Priority, ApprovalType, ApprovalStatus, ActivityType } from '@prisma/client';

export { UserRole, OpportunityStatus, OpportunityType, Priority, ApprovalType, ApprovalStatus, ActivityType };

// Auth Types
export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

// User Types
export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  region?: string;
  supervisorId?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  phone?: string;
  region?: string;
  supervisorId?: string;
  active?: boolean;
}

// Opportunity Types
export interface CreateOpportunityRequest {
  title: string;
  description?: string;
  type: OpportunityType;
  priority?: Priority;
  estimatedValue: number;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  contactPosition?: string;
  address: string;
  city: string;
  state: string;
  cep?: string;
  estimatedWeight: number;
  weightUnit?: string;
  assignedToId: string;
  materials?: CreateMaterialRequest[];
  financials?: CreateFinancialRequest;
  expectedCloseDate?: Date;
}

export interface CreateMaterialRequest {
  name: string;
  category: string;
  subcategory?: string;
  estimatedQuantity: number;
  unit: string;
  estimatedUnitValue: number;
  notes?: string;
}

export interface CreateFinancialRequest {
  operationCost: number;
  logisticsCost: number;
  equipmentCost: number;
  laborCost: number;
  otherCosts: number;
  totalCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  profitMargin: number;
  roi: number;
  paybackMonths: number;
}

// Approval Types
export interface CreateApprovalRequest {
  opportunityId: string;
  type: ApprovalType;
  requestNotes?: string;
  changes?: any;
}

export interface ProcessApprovalRequest {
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
}

// Activity Types
export interface CreateActivityRequest {
  opportunityId: string;
  type: ActivityType;
  description: string;
  metadata?: any;
  followUpDate?: Date;
}

// Access Code Types
export interface CreateAccessCodeRequest {
  email: string;
  name: string;
  role: UserRole;
}

// Application Types
export interface CreateApplicationRequest {
  fullName: string;
  email: string;
  phone: string;
  cpf: string;
  region: string;
  city: string;
  type: 'comprador' | 'parceiro';
  experience?: string;
  hasVehicle?: string;
  currentCompany?: string;
  companyName?: string;
  cnpj?: string;
  companySize?: string;
  monthlyVolume?: string;
  message?: string;
}

// Password Reset Types
export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  code: string;
  newPassword: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
