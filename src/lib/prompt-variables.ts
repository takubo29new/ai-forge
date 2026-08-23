const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractVariableNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}

export function renderTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(VARIABLE_PATTERN, (_match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name] : `{{${name}}}`,
  );
}
