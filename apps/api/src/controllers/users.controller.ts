import { Request, Response } from 'express';
import { z } from 'zod';
import { usersService } from '../services/users.service';
import { UserRole } from '@prisma/client';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createUserSchema = z.object({
  email: z.string().email('Nieprawidlowy adres email'),
  password: z.string().min(8, 'Haslo musi miec co najmniej 8 znak�w'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  role: z.enum(['CUSTOMER', 'ADMIN', 'WAREHOUSE', 'B2B_PARTNER', 'HANDLOWIEC']).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email('Nieprawidlowy adres email').optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['CUSTOMER', 'ADMIN', 'WAREHOUSE', 'B2B_PARTNER', 'HANDLOWIEC']).optional(),
  isActive: z.boolean().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(['CUSTOMER', 'ADMIN', 'WAREHOUSE', 'B2B_PARTNER', 'HANDLOWIEC']),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Haslo musi miec co najmniej 8 znak�w'),
});

// ============================================
// CONTROLLER
// ============================================

export const usersController = {
  /**
   * GET /api/users
   * Get all users with pagination and filters
   */
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = '1',
        limit = '20',
        search,
        role,
        isActive,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const result = await usersService.getAll({
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        search: search as string | undefined,
        role: role as UserRole | undefined,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Nie udalo sie pobrac uzytkownik�w' });
    }
  },

  /**
   * GET /api/users/stats
   * Get user statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await usersService.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ message: 'Nie udalo sie pobrac statystyk uzytkownik�w' });
    }
  },

  /**
   * GET /api/users/:id
   * Get single user by ID
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersService.getById(id);
      res.json(user);
    } catch (error) {
      if (error instanceof Error && error.message === 'Uzytkownik nie zostal znaleziony') {
        res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
        return;
      }
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Nie udalo sie pobrac uzytkownika' });
    }
  },

  /**
   * POST /api/users
   * Create new user
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const validation = createUserSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
        return;
      }

      const user = await usersService.create(validation.data);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email jest juz uzywany') {
          res.status(409).json({ message: 'Email jest juz uzywany' });
          return;
        }
        if (error.message.startsWith('Invalid password')) {
          res.status(400).json({ message: error.message });
          return;
        }
      }
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Nie udalo sie utworzyc uzytkownika' });
    }
  },

  /**
   * PUT /api/users/:id
   * Update user
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validation = updateUserSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
        return;
      }

      const user = await usersService.update(id, validation.data);
      res.json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Uzytkownik nie zostal znaleziony') {
          res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
          return;
        }
        if (error.message === 'Email jest juz uzywany') {
          res.status(409).json({ message: 'Email jest juz uzywany' });
          return;
        }
      }
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Nie udalo sie zaktualizowac uzytkownika' });
    }
  },

  /**
   * PATCH /api/users/:id/role
   * Change user role
   */
  async changeRole(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validation = changeRoleSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
        return;
      }

      // Prevent changing own role
      if (req.user?.userId === id) {
        res.status(403).json({ message: 'Nie mozesz zmienic wlasnej roli' });
        return;
      }

      const user = await usersService.changeRole(id, validation.data.role as UserRole);
      res.json(user);
    } catch (error) {
      if (error instanceof Error && error.message === 'Uzytkownik nie zostal znaleziony') {
        res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
        return;
      }
      console.error('Error changing user role:', error);
      res.status(500).json({ message: 'Nie udalo sie zmienic roli uzytkownika' });
    }
  },

  /**
   * POST /api/users/:id/block
   * Block user
   */
  async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Prevent blocking yourself
      if (req.user?.userId === id) {
        res.status(403).json({ message: 'Cannot block yourself' });
        return;
      }

      const user = await usersService.blockUser(id);
      res.json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Uzytkownik nie zostal znaleziony') {
          res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
          return;
        }
        if (error.message === 'Uzytkownik jest juz zablokowany') {
          res.status(400).json({ message: 'Uzytkownik jest juz zablokowany' });
          return;
        }
      }
      console.error('Error blocking user:', error);
      res.status(500).json({ message: 'Nie udalo sie zablokowac uzytkownika' });
    }
  },

  /**
   * POST /api/users/:id/unblock
   * Unblock user
   */
  async unblockUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersService.unblockUser(id);
      res.json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Uzytkownik nie zostal znaleziony') {
          res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
          return;
        }
        if (error.message === 'Uzytkownik nie jest zablokowany') {
          res.status(400).json({ message: 'Uzytkownik nie jest zablokowany' });
          return;
        }
      }
      console.error('Error unblocking user:', error);
      res.status(500).json({ message: 'Nie udalo sie odblokowac uzytkownika' });
    }
  },

  /**
   * POST /api/users/:id/unlock
   * Unlock account (clear failed login attempts)
   */
  async unlockAccount(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await usersService.unlockAccount(id);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Uzytkownik nie zostal znaleziony') {
        res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
        return;
      }
      console.error('Error unlocking account:', error);
      res.status(500).json({ message: 'Nie udalo sie odblokowac konta' });
    }
  },

  /**
   * POST /api/users/:id/reset-password
   * Reset user password (admin action)
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validation = resetPasswordSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          message: 'Blad walidacji',
          errors: validation.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await usersService.resetPassword(id, validation.data.password);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Uzytkownik nie zostal znaleziony') {
          res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
          return;
        }
        if (error.message.startsWith('Invalid password')) {
          res.status(400).json({ message: error.message });
          return;
        }
      }
      console.error('Error resetting password:', error);
      res.status(500).json({ message: 'Nie udalo sie zresetowac hasla' });
    }
  },

  /**
   * DELETE /api/users/:id
   * Delete user
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Prevent deleting yourself
      if (req.user?.userId === id) {
        res.status(403).json({ message: 'Cannot delete yourself' });
        return;
      }

      const result = await usersService.delete(id);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Uzytkownik nie zostal znaleziony') {
        res.status(404).json({ message: 'Uzytkownik nie zostal znaleziony' });
        return;
      }
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Nie udalo sie usunac uzytkownika' });
    }
  },
};
