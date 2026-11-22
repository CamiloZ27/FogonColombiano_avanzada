import 'dotenv/config';
import { app } from './app';
import { inicializarBaseDeDatos } from './db/initDb';

const PORT = process.env.PORT || 4000;

async function iniciarServidor() {
  try {
    console.log('Inicializando esquema PostgreSQL, roles RBAC predefinidos y catálogo base...');
    await inicializarBaseDeDatos();
    console.log('Base de datos verificada e inicializada correctamente.');
  } catch (err) {
    console.error('Advertencia al inicializar base de datos en arranque:', err);
  }

  app.listen(PORT, () => {
    console.log(`Servidor Fogón Colombiano corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor();
