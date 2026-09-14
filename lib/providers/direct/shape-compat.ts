/** Mantido para compatibilidade com os testes da forma antiga do payload. */
export function encodeListingId(listingId: string): string {
  if (/^[A-Za-z0-9+/=]{12,}$/.test(listingId) && !/^\d+$/.test(listingId)) {
    return listingId;
  }
  return Buffer.from(`StayListing:${listingId}`, "utf8").toString("base64");
}
