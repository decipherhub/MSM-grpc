export interface ComputationRequest {
  clientId: string;
}

export interface ComputationData {
  scalar: Uint8Array[];
  x: Uint8Array[];
  y: Uint8Array[];
}

export interface ComputationResult {
  resultX: Uint8Array;
  resultY: Uint8Array;
}

export interface ResultAck {
  success: boolean;
}
