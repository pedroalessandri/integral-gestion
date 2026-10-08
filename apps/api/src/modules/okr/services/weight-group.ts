// Los helpers de pesos todo-o-nada (RN-P6) viven en `common/weights` porque también los usa `metrics`
// (indicadores de un objetivo) y un módulo no puede importar internos de otro. Re-export para no tocar a `okr`.
export { assertValidWeightGroup, assertSameSiblingSet } from '../../../common/weights/weight-group.js';
