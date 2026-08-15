const PRIVATE_LOCATOR_PROTOCOL = "juro-private:";
const PRIVATE_LOCATOR_HOST = "document";
const PRIVATE_VECTOR_ID = /^ud_[a-f0-9]{61}$/u;

export function privateDocumentLocator(vectorId: string): string {
  if (!PRIVATE_VECTOR_ID.test(vectorId)) throw new TypeError("PRIVATE_DOCUMENT_VECTOR_ID_INVALID");
  return `${PRIVATE_LOCATOR_PROTOCOL}//${PRIVATE_LOCATOR_HOST}/${vectorId}`;
}
export function parsePrivateDocumentLocator(value: string): string | null {
  try {
    const url = new URL(value);
    const vectorId = url.pathname.replace(/^\//u, "");
    return url.protocol === PRIVATE_LOCATOR_PROTOCOL
      && url.hostname === PRIVATE_LOCATOR_HOST
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && PRIVATE_VECTOR_ID.test(vectorId)
      ? vectorId
      : null;
  } catch {
    return null;
  }
}
