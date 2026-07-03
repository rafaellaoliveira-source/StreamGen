// ─── hooks/useDownloads.js ────────────────────────────────────────────────────
import { useCallback } from "react";
import { makeCSV, splitCSV } from "../export/csv.js";
import { makeARFF, splitARFF } from "../export/arff.js";
import { makeMetaTXT } from "../export/meta.js";

/**
 * Encapsulates all dataset and image download logic.
 *
 * @param {object} deps
 * @param {object|null} deps.precomp       - Precomputed stream data
 * @param {React.MutableRefObject} deps.trajRef        - Ref to trajectories array
 * @param {React.MutableRefObject} deps.canvasRef      - Ref to canvas element
 * @param {string}  deps.filename          - Base filename (may include .csv extension)
 * @param {number}  deps.numExtraFeatures  - Number of extra features
 * @param {string}  deps.labelMode         - "multiclass" | "multilabel"
 * @param {number}  deps.trainPct          - Train split percentage (0-100)
 * @param {function} deps.setStatus        - Status setter from App state
 */
export function useDownloads({
  precomp, trajRef, canvasRef,
  filename, numExtraFeatures, labelMode, trainPct,
  setStatus,
}) {
  // ── Helpers ────────────────────────────────────────────────────────────────

  const base = useCallback(() =>
    filename.endsWith(".csv") ? filename.replace(".csv", "") : filename
  , [filename]);

  const triggerDownload = useCallback((content, fname, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── CSV ────────────────────────────────────────────────────────────────────

  const downloadCSVComplete = useCallback(() => {
    if(!precomp){ setStatus({msg:"Generate a stream first!", color:"#f97316"}); return; }
    const csv = makeCSV(precomp.pointClass, trajRef.current, numExtraFeatures, labelMode);
    triggerDownload(csv, `${base()}.csv`, "text/csv");
    setStatus({msg:`"${base()}.csv" downloaded!`, color:"#22c55e"});
  }, [precomp, filename, numExtraFeatures, labelMode, triggerDownload, base, setStatus]);

  const downloadCSV = useCallback(() => {
    if(!precomp){ setStatus({msg:"Generate a stream first!", color:"#f97316"}); return; }
    const csv = makeCSV(precomp.pointClass, trajRef.current, numExtraFeatures, labelMode);
    const { train, test } = splitCSV(csv, trainPct);
    triggerDownload(train, `${base()}_train.csv`, "text/csv");
    triggerDownload(test,  `${base()}_test.csv`,  "text/csv");
    setStatus({msg:`"${base()}_train/test.csv" downloaded!`, color:"#22c55e"});
  }, [precomp, filename, numExtraFeatures, labelMode, trainPct, triggerDownload, base, setStatus]);

  // ── ARFF ───────────────────────────────────────────────────────────────────

  const downloadARFFComplete = useCallback(() => {
    if(!precomp){ setStatus({msg:"Generate a stream first!", color:"#f97316"}); return; }
    const arff = makeARFF(precomp.pointClass, trajRef.current, numExtraFeatures, labelMode);
    triggerDownload(arff, `${base()}.arff`, "text/plain");
    setStatus({msg:`"${base()}.arff" downloaded!`, color:"#22c55e"});
  }, [precomp, filename, numExtraFeatures, labelMode, triggerDownload, base, setStatus]);

  const downloadARFF = useCallback(() => {
    if(!precomp){ setStatus({msg:"Generate a stream first!", color:"#f97316"}); return; }
    const arff = makeARFF(precomp.pointClass, trajRef.current, numExtraFeatures, labelMode);
    const { train, test } = splitARFF(arff, trainPct);
    triggerDownload(train, `${base()}_train.arff`, "text/plain");
    triggerDownload(test,  `${base()}_test.arff`,  "text/plain");
    setStatus({msg:`"${base()}_train/test.arff" downloaded!`, color:"#22c55e"});
  }, [precomp, filename, numExtraFeatures, labelMode, trainPct, triggerDownload, base, setStatus]);

  // ── Meta & Image ───────────────────────────────────────────────────────────

  const downloadMeta = useCallback(() => {
    if(!precomp){ setStatus({msg:"Generate a stream first!", color:"#f97316"}); return; }
    const txt = makeMetaTXT(
      trajRef.current, precomp.driftTicks,
      numExtraFeatures, trainPct, labelMode, precomp.pointClass
    );
    triggerDownload(txt, `${base()}_meta.txt`, "text/plain");
    setStatus({msg:`"${base()}_meta.txt" downloaded!`, color:"#22c55e"});
  }, [precomp, filename, numExtraFeatures, trainPct, labelMode, triggerDownload, base, setStatus]);

  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${base()}.png`;
    a.click();
    setStatus({msg:"Saved image!", color:"#22c55e"});
  }, [filename, canvasRef, base, setStatus]);

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    downloadCSVComplete,
    downloadCSV,
    downloadARFFComplete,
    downloadARFF,
    downloadMeta,
    downloadImage,
  };
}