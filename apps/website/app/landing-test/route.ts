export function GET(request: Request) {
  const source = new URL(request.url);
  const destination = new URL("/", source.origin);
  for (const [key, value] of source.searchParams) {
    if (["lang", "accountType"].includes(key)) destination.searchParams.append(key, value);
  }
  return Response.redirect(destination, 308);
}
