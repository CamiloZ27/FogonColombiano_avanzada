import { Router } from 'express';
import { autenticarJWT, requerirPermiso } from '../middleware/auth.middleware';
import {
  crearTransaccionConUsuario,
  obtenerTransacciones,
  calcularHashEndpoint,
} from '../controllers/transacciones.controller';

const router = Router();

router.use(autenticarJWT);

router.get('/', requerirPermiso('transacciones:ver'), obtenerTransacciones);
router.post('/', requerirPermiso('transacciones:crear'), crearTransaccionConUsuario);
router.post('/generar-hash', requerirPermiso('transacciones:crear'), calcularHashEndpoint);

export default router;
