import { Router } from 'express';
import {
  crearTransaccionConUsuario,
  obtenerTransacciones,
  calcularHashEndpoint,
} from '../controllers/transacciones.controller';

const router = Router();

router.get('/', obtenerTransacciones);
router.post('/', crearTransaccionConUsuario);
router.post('/generar-hash', calcularHashEndpoint);

export default router;
