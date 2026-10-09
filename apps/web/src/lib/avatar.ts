/**
 * 头像图片处理（纯浏览器）：等比缩放到最长边 ≤1000px（不裁剪），质量自适应压到 ≤700KB，
 * 与服务端上限（`AVATAR_MAX_BYTES`）保持一致——超出会被服务端拒绝，这里先压到位。
 *
 * 编码策略：原图是 PNG 且确实含透明通道时优先输出 PNG（保住透明）；
 * PNG 超限或非透明图则输出 JPEG，并把透明像素铺成白色（JPEG 无 alpha）。
 */

export const AVATAR_MAX_EDGE = 1000;
/** 与 apps/api 的 AVATAR_MAX_BYTES 对齐。 */
export const AVATAR_MAX_BYTES = 700 * 1024;
const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface AvatarImage {
  dataUrl: string;
  width: number;
  height: number;
  /** 解码后的字节数（估算，用于提示与服务端上限对齐）。 */
  bytes: number;
}

/** data URL 的解码后字节数（base64 长度换算）。 */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const base64Length = dataUrl.length - comma - 1;
  return Math.floor((base64Length * 3) / 4);
}

/** 采样 alpha 通道：只要有一个像素不是全不透明就认为带透明。 */
function hasAlphaChannel(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = context.getImageData(0, 0, width, height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 255) return true;
    }
    return false;
  } catch {
    // 读不到像素（极小概率的跨域污染等）：按不带透明处理
    return false;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片无法读取"));
    };
    image.src = url;
  });
}

/** 把用户选的文件压成可上传的 data URL；失败抛出可直接展示的中文错误。 */
export async function fileToAvatarDataUrl(file: File): Promise<AvatarImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("只支持 JPEG / PNG / WebP 图片");
  }
  if (file.size > SOURCE_MAX_BYTES) {
    throw new Error(`原图 ${(file.size / 1024 / 1024).toFixed(1)}MB 过大，请选 20MB 以内的图片`);
  }

  const source = await loadBitmap(file);
  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) throw new Error("图片无法读取");

  const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片处理");

  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  if ("close" in source && typeof source.close === "function") source.close();

  if (file.type === "image/png" && hasAlphaChannel(context, width, height)) {
    const png = canvas.toDataURL("image/png");
    const bytes = dataUrlBytes(png);
    if (bytes <= AVATAR_MAX_BYTES) return { dataUrl: png, width, height, bytes };
    // PNG 太大：铺白底后转 JPEG
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  }

  for (const quality of [0.85, 0.8, 0.7, 0.6]) {
    const jpeg = canvas.toDataURL("image/jpeg", quality);
    const bytes = dataUrlBytes(jpeg);
    if (bytes <= AVATAR_MAX_BYTES) return { dataUrl: jpeg, width, height, bytes };
  }

  throw new Error("图片压缩后仍超过 700KB，请换一张更简单的图片");
}