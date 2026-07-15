// Pure rule for whether an env var's value should be shown in the UI.
// Values are hidden by default (safer for screenshots/screen-share):
//   - secrets: only when individually revealed
//   - plain: when individually revealed OR the global "show all plain" flag is on
export function computeShowValue(
  v: { id: string; isSecret: boolean },
  revealed: ReadonlySet<string>,
  revealAllPlain: boolean,
): boolean {
  if (v.isSecret) return revealed.has(v.id)
  return revealAllPlain || revealed.has(v.id)
}
