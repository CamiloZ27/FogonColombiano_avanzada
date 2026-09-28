import { Router } from 'express';
import { crearTransaccionConUsuario} from '../controllers/transacciones.controller';

const router = Router();

// Si está montado en /api/transacciones, aquí la ruta es '/'
router.post('/', crearTransaccionConUsuario);

export default router;