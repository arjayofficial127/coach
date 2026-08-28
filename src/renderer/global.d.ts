import type { LatticeApi } from "../shared/contracts";

declare global {
  interface Window {
    lattice: LatticeApi;
  }
}
