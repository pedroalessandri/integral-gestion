export interface RebalanceKrWeightsItemDto {
  krId: string;
  /** Integer 0..10000. */
  weightBp: number;
}

/** Request body for POST /api/v1/okr/objectives/:id/rebalance-weights. Must include ALL active KRs (CU-03). */
export interface RebalanceKrWeightsDto {
  items: RebalanceKrWeightsItemDto[];
}
