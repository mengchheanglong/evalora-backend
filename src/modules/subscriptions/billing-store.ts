import type { PaymentAttempt, Prisma, Subscription } from "@prisma/client";

/**
 * The narrow slice of Prisma the billing flows use.
 *
 * PrismaService satisfies it structurally, and an in-memory fake can satisfy it
 * in tests without mocking the whole generated client. A Prisma interactive
 * transaction client satisfies it too, which is what lets activation run inside
 * one transaction: the attempt is claimed from PENDING and the subscription is
 * extended in the same atomic unit.
 */
export interface BillingDb {
  subscription: {
    findUnique(args: { where: { organizationId: string } }): Promise<Subscription | null>;
    create(args: { data: Prisma.SubscriptionUncheckedCreateInput }): Promise<Subscription>;
    update(args: { where: { id: string }; data: Prisma.SubscriptionUncheckedUpdateInput }): Promise<Subscription>;
    updateMany(args: {
      where: Prisma.SubscriptionWhereInput;
      data: Prisma.SubscriptionUncheckedUpdateManyInput;
    }): Promise<{ count: number }>;
  };
  paymentAttempt: {
    findUnique(args: { where: { tranId: string } | { id: string } }): Promise<PaymentAttempt | null>;
    findFirst(args: {
      where: Prisma.PaymentAttemptWhereInput;
      orderBy?: Prisma.PaymentAttemptOrderByWithRelationInput;
    }): Promise<PaymentAttempt | null>;
    create(args: { data: Prisma.PaymentAttemptUncheckedCreateInput }): Promise<PaymentAttempt>;
    update(args: { where: { id: string }; data: Prisma.PaymentAttemptUncheckedUpdateInput }): Promise<PaymentAttempt>;
    updateMany(args: {
      where: Prisma.PaymentAttemptWhereInput;
      data: Prisma.PaymentAttemptUncheckedUpdateManyInput;
    }): Promise<{ count: number }>;
  };
}
