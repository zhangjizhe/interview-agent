import { NotFoundException } from '@nestjs/common';
import { requireOwnedInterview } from '../common/ownership.util';

describe('requireOwnedInterview', () => {
  it('queries by both interview ID and authenticated owner', async () => {
    const prisma = {
      interview: { findFirst: jest.fn().mockResolvedValue({ id: 'iv-1', userId: 'user-a' }) },
    };

    await expect(requireOwnedInterview(prisma as any, 'iv-1', 'user-a')).resolves.toMatchObject({
      id: 'iv-1',
      userId: 'user-a',
    });
    expect(prisma.interview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'iv-1', userId: 'user-a' },
    }));
  });

  it('does not disclose a foreign or missing interview', async () => {
    const prisma = {
      interview: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(requireOwnedInterview(prisma as any, 'iv-1', 'user-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
