import { Router } from 'express';
import {
  crearTransaccionConUsuario,
  obtenerTransacciones,
} from '../controllers/transacciones.controller';

const router = Router();

router.get('/', obtenerTransacciones);
router.post('/', crearTransaccionConUsuario);

export default router;