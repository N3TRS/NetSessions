import {
  canChangeRoles,
  canEdit,
  canExecute,
  canSave,
  isOwner,
} from 'src/modules/sessions/permissions';

describe('permissions', () => {
  const owner = 'owner@test.com';
  const user = 'user@test.com';

  describe('isOwner', () => {
    it('returns true when emails match', () => {
      expect(isOwner(owner, owner)).toBe(true);
    });

    it('returns false when emails differ', () => {
      expect(isOwner(owner, user)).toBe(false);
    });
  });

  describe('canEdit', () => {
    it('owner can always edit', () => {
      expect(canEdit(null, owner, owner)).toBe(true);
      expect(canEdit('VIEW', owner, owner)).toBe(true);
    });

    it('null or undefined role cannot edit', () => {
      expect(canEdit(null, owner, user)).toBe(false);
      expect(canEdit(undefined, owner, user)).toBe(false);
    });

    it('VIEW role cannot edit', () => {
      expect(canEdit('VIEW', owner, user)).toBe(false);
    });

    it('VIEW_EDIT and above can edit', () => {
      expect(canEdit('VIEW_EDIT', owner, user)).toBe(true);
      expect(canEdit('VIEW_EDIT_EXECUTE', owner, user)).toBe(true);
      expect(canEdit('VIEW_EDIT_EXECUTE_SAVE', owner, user)).toBe(true);
      expect(canEdit('OWNER', owner, user)).toBe(true);
    });
  });

  describe('canExecute', () => {
    it('owner can always execute', () => {
      expect(canExecute(null, owner, owner)).toBe(true);
    });

    it('VIEW and VIEW_EDIT cannot execute', () => {
      expect(canExecute('VIEW', owner, user)).toBe(false);
      expect(canExecute('VIEW_EDIT', owner, user)).toBe(false);
    });

    it('null or undefined role cannot execute', () => {
      expect(canExecute(null, owner, user)).toBe(false);
      expect(canExecute(undefined, owner, user)).toBe(false);
    });

    it('VIEW_EDIT_EXECUTE and above can execute', () => {
      expect(canExecute('VIEW_EDIT_EXECUTE', owner, user)).toBe(true);
      expect(canExecute('VIEW_EDIT_EXECUTE_SAVE', owner, user)).toBe(true);
      expect(canExecute('OWNER', owner, user)).toBe(true);
    });
  });

  describe('canSave', () => {
    it('owner can always save', () => {
      expect(canSave(null, owner, owner)).toBe(true);
    });

    it('VIEW, VIEW_EDIT, VIEW_EDIT_EXECUTE cannot save', () => {
      expect(canSave('VIEW', owner, user)).toBe(false);
      expect(canSave('VIEW_EDIT', owner, user)).toBe(false);
      expect(canSave('VIEW_EDIT_EXECUTE', owner, user)).toBe(false);
    });

    it('null or undefined role cannot save', () => {
      expect(canSave(null, owner, user)).toBe(false);
      expect(canSave(undefined, owner, user)).toBe(false);
    });

    it('VIEW_EDIT_EXECUTE_SAVE and OWNER can save', () => {
      expect(canSave('VIEW_EDIT_EXECUTE_SAVE', owner, user)).toBe(true);
      expect(canSave('OWNER', owner, user)).toBe(true);
    });
  });

  describe('canChangeRoles', () => {
    it('owner can change roles', () => {
      expect(canChangeRoles(owner, owner)).toBe(true);
    });

    it('non-owner cannot change roles', () => {
      expect(canChangeRoles(owner, user)).toBe(false);
    });
  });
});
