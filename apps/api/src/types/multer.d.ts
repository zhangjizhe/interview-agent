// 全局类型扩展 - 让 Express.Multer.File 可用
import 'multer';
declare global {
  namespace Express {
    interface Multer {
      File: any;
    }
  }
}
export {};
