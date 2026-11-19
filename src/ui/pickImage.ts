import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Choisit une photo dans la galerie du téléphone, la réduit et la renvoie en data URI JPEG.
 * La photo est stockée directement dans la base (pas besoin de stockage de fichiers) :
 * on la réduit pour rester bien sous la limite d'un document Firestore (1 Mo).
 * @returns null si l'utilisateur annule.
 */
export async function pickImage(maxWidth = 1000): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? maxWidth + 1) > maxWidth) ctx.resize({ width: maxWidth });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  return `data:image/jpeg;base64,${out.base64}`;
}
