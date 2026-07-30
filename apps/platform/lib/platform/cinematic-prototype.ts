export function isCinematicPrototypeEnvironment(
  appEnvironment: string | undefined,
): boolean {
  return appEnvironment === "staging";
}
