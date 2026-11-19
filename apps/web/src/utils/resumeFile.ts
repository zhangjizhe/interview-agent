/** Match the existing server's accepted resume types and ten-megabyte limit. */
export function resumeFileError(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.(pdf|md|txt)$/i.test(file.name)) return '请选择 PDF、Markdown 或 TXT 简历，暂不支持 Word 和图片。';
  if (!file.size || file.size > 10 * 1024 * 1024) return '简历不能为空，且不能超过 10 MB。';
  return null;
}
