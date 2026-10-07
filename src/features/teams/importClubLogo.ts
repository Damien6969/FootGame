export async function importClubLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choisissez une image PNG, JPG ou WebP.')
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Le logo doit peser moins de 5 Mo.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    try { await image.decode() } catch { throw new Error('Cette image ne peut pas être lue. Essayez un autre fichier.') }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Cette image est vide.')
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Le navigateur ne peut pas préparer cette image.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
