// Weighted KMeans in OKLab space with k-means++ seeding.
// Input samples carry a weight (pixel count) so downsampled cells that
// aggregate many source pixels pull centroids proportionally.

import type { Lab } from './oklab';

export interface WeightedSample extends Lab {
  weight: number;
}

export interface Cluster {
  center: Lab;
  weight: number;
}

function dist2(a: Lab, b: Lab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

/**
 * Returns k cluster centers plus, for each input sample, the index of its
 * assigned cluster. k is clamped to the number of distinct samples.
 */
export function kmeans(
  samples: WeightedSample[],
  k: number,
  maxIters = 30,
): { clusters: Cluster[]; assignments: Int32Array } {
  const n = samples.length;
  const kk = Math.max(1, Math.min(k, n));
  const assignments = new Int32Array(n);

  if (n === 0) return { clusters: [], assignments };

  // k-means++ seeding, weighted by sample weight.
  const centers: Lab[] = [];
  const first = weightedPick(samples);
  centers.push({ L: first.L, a: first.a, b: first.b });

  const dbest = new Float64Array(n).fill(Infinity);
  while (centers.length < kk) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = dist2(samples[i], last);
      if (d < dbest[i]) dbest[i] = d;
      total += dbest[i] * samples[i].weight;
    }
    if (total === 0) break; // all remaining samples coincide with a center
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= dbest[i] * samples[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centers.push({ L: samples[idx].L, a: samples[idx].a, b: samples[idx].b });
  }

  const clusters: Cluster[] = centers.map((c) => ({ center: c, weight: 0 }));

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;

    // Assignment step.
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < clusters.length; c++) {
        const d = dist2(samples[i], clusters[c].center);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }

    // Update step (weighted mean).
    const sumL = new Float64Array(clusters.length);
    const sumA = new Float64Array(clusters.length);
    const sumB = new Float64Array(clusters.length);
    const sumW = new Float64Array(clusters.length);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      const w = samples[i].weight;
      sumL[c] += samples[i].L * w;
      sumA[c] += samples[i].a * w;
      sumB[c] += samples[i].b * w;
      sumW[c] += w;
    }
    for (let c = 0; c < clusters.length; c++) {
      if (sumW[c] > 0) {
        clusters[c].center = {
          L: sumL[c] / sumW[c],
          a: sumA[c] / sumW[c],
          b: sumB[c] / sumW[c],
        };
        clusters[c].weight = sumW[c];
      }
    }

    if (!changed && iter > 0) break;
  }

  return { clusters, assignments };
}

function weightedPick(samples: WeightedSample[]): WeightedSample {
  let total = 0;
  for (const s of samples) total += s.weight;
  let r = Math.random() * total;
  for (const s of samples) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return samples[samples.length - 1];
}
