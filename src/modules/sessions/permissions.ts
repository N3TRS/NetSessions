export type PermissionLevel =
  | 'OWNER'
  | 'VIEW_EDIT_EXECUTE_SAVE'
  | 'VIEW_EDIT_EXECUTE'
  | 'VIEW_EDIT'
  | 'VIEW';

export function isOwner(ownerEmail: string, userEmail: string): boolean {
  return ownerEmail === userEmail;
}

export function canEdit(
  role: PermissionLevel | null | undefined,
  ownerEmail: string,
  userEmail: string,
): boolean {
  if (isOwner(ownerEmail, userEmail)) return true;
  if (role === null || role === undefined) return false;
  return role !== 'VIEW';
}

export function canExecute(
  role: PermissionLevel | null | undefined,
  ownerEmail: string,
  userEmail: string,
): boolean {
  if (isOwner(ownerEmail, userEmail)) return true;
  return (
    role === 'VIEW_EDIT_EXECUTE' ||
    role === 'VIEW_EDIT_EXECUTE_SAVE' ||
    role === 'OWNER'
  );
}

export function canSave(
  role: PermissionLevel | null | undefined,
  ownerEmail: string,
  userEmail: string,
): boolean {
  if (isOwner(ownerEmail, userEmail)) return true;
  return role === 'VIEW_EDIT_EXECUTE_SAVE' || role === 'OWNER';
}

export function canChangeRoles(
  ownerEmail: string,
  userEmail: string,
): boolean {
  return isOwner(ownerEmail, userEmail);
}
