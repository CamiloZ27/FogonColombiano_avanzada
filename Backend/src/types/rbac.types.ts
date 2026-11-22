export type RolCodigo =
  | 'admin'
  | 'gerente'
  | 'jefe_cocina'
  | 'cocinero'
  | 'cajero'
  | 'cliente';

export type PermisoCodigo =
  | 'panel:ver'
  | 'admin:config'
  | 'admin:auditoria'
  | 'usuarios:ver'
  | 'usuarios:crud'
  | 'catalogo:ver'
  | 'catalogo:crud'
  | 'pedidos:ver'
  | 'pedidos:crear'
  | 'pedidos:cocina'
  | 'pedidos:anular'
  | 'facturas:ver'
  | 'facturas:crear'
  | 'facturas:anular'
  | 'pagos:ver'
  | 'pagos:crear'
  | 'transacciones:ver'
  | 'transacciones:crear'
  | 'anomalias:ver'
  | 'anomalias:gestionar'
  | 'calidad:ver'
  | 'calidad:ejecutar'
  | 'integridad:ver'
  | 'integridad:verificar'
  | 'algoritmos:ver'
  | 'ia:ver'
  | 'ia:entrenar';

export interface DefinicionRolSistema {
  codigo: RolCodigo;
  nombre: string;
  descripcion: string;
  nivel_acceso: number;
  permisos: PermisoCodigo[];
  es_sistema: true;
  editable: false;
}

/**
 * Catálogo inmutable de roles RBAC predefinidos del sistema Fogón Colombiano.
 * Ningún endpoint ni usuario (ni siquiera admin) puede crear, renombrar,
 * alterar permisos estructurales ni eliminar estos roles.
 */
export const ROLES_SISTEMA: readonly DefinicionRolSistema[] = Object.freeze([
  {
    codigo: 'admin',
    nombre: 'Administrador',
    descripcion: 'Control total del sistema, gestión de usuarios, asignación de roles predefinidos, configuración global y auditoría de seguridad.',
    nivel_acceso: 100,
    es_sistema: true,
    editable: false,
    permisos: [
      'panel:ver',
      'admin:config',
      'admin:auditoria',
      'usuarios:ver',
      'usuarios:crud',
      'catalogo:ver',
      'catalogo:crud',
      'pedidos:ver',
      'pedidos:crear',
      'pedidos:cocina',
      'pedidos:anular',
      'facturas:ver',
      'facturas:crear',
      'facturas:anular',
      'pagos:ver',
      'pagos:crear',
      'transacciones:ver',
      'transacciones:crear',
      'anomalias:ver',
      'anomalias:gestionar',
      'calidad:ver',
      'calidad:ejecutar',
      'integridad:ver',
      'integridad:verificar',
      'algoritmos:ver',
      'ia:ver',
      'ia:entrenar',
    ],
  },
  {
    codigo: 'gerente',
    nombre: 'Gerente',
    descripcion: 'Supervisión integral del negocio: ventas, facturación, pagos, inventario, anomalías, calidad de datos, integridad, benchmarks e IA.',
    nivel_acceso: 80,
    es_sistema: true,
    editable: false,
    permisos: [
      'panel:ver',
      'usuarios:ver',
      'catalogo:ver',
      'catalogo:crud',
      'pedidos:ver',
      'pedidos:crear',
      'pedidos:anular',
      'facturas:ver',
      'facturas:crear',
      'facturas:anular',
      'pagos:ver',
      'pagos:crear',
      'transacciones:ver',
      'transacciones:crear',
      'anomalias:ver',
      'anomalias:gestionar',
      'calidad:ver',
      'calidad:ejecutar',
      'integridad:ver',
      'integridad:verificar',
      'algoritmos:ver',
      'ia:ver',
      'ia:entrenar',
    ],
  },
  {
    codigo: 'jefe_cocina',
    nombre: 'Jefe de Cocina',
    descripcion: 'Administra categorías, platos e inventario de cocina, supervisa la cola y estados de pedidos y revisa calidad de datos del catálogo.',
    nivel_acceso: 60,
    es_sistema: true,
    editable: false,
    permisos: [
      'panel:ver',
      'catalogo:ver',
      'catalogo:crud',
      'pedidos:ver',
      'pedidos:cocina',
      'pedidos:anular',
      'calidad:ver',
      'calidad:ejecutar',
      'algoritmos:ver',
      'ia:ver',
    ],
  },
  {
    codigo: 'cocinero',
    nombre: 'Cocinero',
    descripcion: 'Operación diaria de cocina: consulta pedidos pendientes, avanza preparación/entrega y verifica disponibilidad del menú.',
    nivel_acceso: 40,
    es_sistema: true,
    editable: false,
    permisos: [
      'catalogo:ver',
      'pedidos:ver',
      'pedidos:cocina',
    ],
  },
  {
    codigo: 'cajero',
    nombre: 'Cajero / Mesero',
    descripcion: 'Atención de punto de venta: crea pedidos multi-ítem, emite facturas consecutivas, registra pagos con comprobante y transacciones.',
    nivel_acceso: 45,
    es_sistema: true,
    editable: false,
    permisos: [
      'panel:ver',
      'catalogo:ver',
      'pedidos:ver',
      'pedidos:crear',
      'facturas:ver',
      'facturas:crear',
      'pagos:ver',
      'pagos:crear',
      'transacciones:ver',
      'transacciones:crear',
      'integridad:ver',
    ],
  },
  {
    codigo: 'cliente',
    nombre: 'Cliente',
    descripcion: 'Consulta la carta del restaurante, realiza pedidos por canal digital/domicilio y visualiza sus propios pedidos, facturas y pagos.',
    nivel_acceso: 10,
    es_sistema: true,
    editable: false,
    permisos: [
      'catalogo:ver',
      'pedidos:ver',
      'pedidos:crear',
      'facturas:ver',
      'pagos:ver',
      'pagos:crear',
    ],
  },
]);

export const CODIGOS_ROLES_VALIDOS: readonly RolCodigo[] = ROLES_SISTEMA.map((r) => r.codigo);

export function obtenerDefinicionRol(codigo: string): DefinicionRolSistema | undefined {
  return ROLES_SISTEMA.find((r) => r.codigo === codigo);
}

export interface UsuarioAutenticado {
  id: number;
  nombre: string;
  email: string;
  rol: RolCodigo;
  rol_nombre: string;
  permisos: PermisoCodigo[];
  estado: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

