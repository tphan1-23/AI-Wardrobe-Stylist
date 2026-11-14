// What the person sees when the server sends an error we did not plan for. The raw text can name a
// table, a constraint or a function (for example "new row violates row-level security policy for
// table ..."), so it goes to the developer log only. The errors we do expect have their own
// plain-language messages in each service (friendlyHouseholdError and the like).
export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function unexpectedError(where: string, message: string): string {
  console.warn(`[${where}] unexpected error:`, message);
  return GENERIC_ERROR;
}
