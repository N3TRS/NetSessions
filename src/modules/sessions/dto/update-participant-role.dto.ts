import { IsIn } from 'class-validator';

export const ASSIGNABLE_ROLE_VALUES = [
  'VIEW_EDIT_EXECUTE_SAVE',
  'VIEW_EDIT_EXECUTE',
  'VIEW_EDIT',
  'VIEW',
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLE_VALUES)[number];

export class UpdateParticipantRoleDto {
  @IsIn(ASSIGNABLE_ROLE_VALUES as readonly string[])
  role!: AssignableRole;
}
