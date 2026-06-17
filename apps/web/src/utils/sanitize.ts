const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong', 'code', 'pre', 'br', 'p', 'ul', 'ol', 'li']);

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize HTML by removing disallowed tags and all attributes.
 * Keeps only whitelisted safe tags, strips everything else.
 */
export function sanitizeHtml(dirty: string): string {
  const doc = new DOMParser().parseFromString(dirty, 'text/html');
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // strip the tag but keep children
      return Array.from(el.childNodes).map(walk).join('');
    }
    // keep tag but strip all attributes
    const inner = Array.from(el.childNodes).map(walk).join('');
    return `<${tag}>${inner}</${tag}>`;
  };
  return Array.from(doc.body.childNodes).map(walk).join('');
}
